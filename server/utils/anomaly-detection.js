/**
 * Anomaly Detection - Sistema de Detecção de Anomalias
 * Detecta comportamentos anômalos usando técnicas básicas de Machine Learning.
 */

const { Pool } = require("pg");
const { alertAnomaly } = require("./security-alerts");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || "impgeo_user",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "impgeo_db",
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
});

const THRESHOLDS = {
  MAX_REQUESTS_PER_MINUTE: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60,
  MAX_FAILED_LOGINS_PER_HOUR: parseInt(process.env.MAX_FAILED_LOGINS_PER_HOUR) || 10,
  MAX_COUNTRIES_PER_DAY: parseInt(process.env.MAX_COUNTRIES_PER_DAY) || 3,
  MAX_IPS_PER_DAY: parseInt(process.env.MAX_IPS_PER_DAY) || 5,
  UNUSUAL_HOUR_START: parseInt(process.env.UNUSUAL_HOUR_START) || 2,
  UNUSUAL_HOUR_END: parseInt(process.env.UNUSUAL_HOUR_END) || 6,
  Z_SCORE_THRESHOLD: parseFloat(process.env.Z_SCORE_THRESHOLD) || 2.5,
};

const baselinesCache = new Map();

function mean(values) {
  if (values.length === 0) return 0;
  return values.reduce((sum, val) => sum + val, 0) / values.length;
}

function stdDev(values) {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((val) => Math.pow(val - avg, 2));
  return Math.sqrt(mean(squaredDiffs));
}

function zScore(value, values) {
  const avg = mean(values);
  const std = stdDev(values);
  if (std === 0) return 0;
  return (value - avg) / std;
}

function isOutlier(value, values, threshold = THRESHOLDS.Z_SCORE_THRESHOLD) {
  const z = Math.abs(zScore(value, values));
  return z > threshold;
}

async function getUserBaseline(userId) {
  const cached = baselinesCache.get(userId);
  if (cached && Date.now() - cached.timestamp < 3600000) {
    return cached.data;
  }

  try {
    const result = await pool.query(
      `SELECT
        ARRAY_AGG(DISTINCT country) as countries,
        ARRAY_AGG(DISTINCT city) as cities,
        ARRAY_AGG(DISTINCT EXTRACT(HOUR FROM created_at)) as access_hours,
        COUNT(*) as total_logins,
        COUNT(DISTINCT DATE(created_at)) as active_days
      FROM active_sessions s1
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '30 days'
      GROUP BY user_id`,
      [userId],
    );

    if (result.rows.length === 0) {
      return null;
    }

    const baseline = {
      countries: result.rows[0].countries || [],
      cities: result.rows[0].cities || [],
      accessHours: (result.rows[0].access_hours || []).map((h) => parseInt(h)),
      totalLogins: parseInt(result.rows[0].total_logins),
      activeDays: parseInt(result.rows[0].active_days),
    };

    baselinesCache.set(userId, {
      data: baseline,
      timestamp: Date.now(),
    });

    return baseline;
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao obter baseline:", error);
    return null;
  }
}

async function detectNewCountry(userId, country) {
  if (!country) return { anomaly: false };

  const baseline = await getUserBaseline(userId);
  if (!baseline || baseline.totalLogins < 5) {
    return { anomaly: false, reason: "Usuário novo, sem baseline" };
  }

  const isNew = !baseline.countries.includes(country);

  if (isNew) {
    const score = 80;
    await alertAnomaly(
      userId,
      "Login de Novo País",
      `Usuário geralmente acessa de: ${baseline.countries.join(", ")}\nLogin detectado de: ${country}`,
      score,
    );

    return { anomaly: true, type: "new_country", score, baseline: baseline.countries, detected: country };
  }

  return { anomaly: false };
}

async function detectUnusualHour(userId, hour) {
  const baseline = await getUserBaseline(userId);
  if (!baseline || baseline.totalLogins < 10) {
    return { anomaly: false, reason: "Usuário novo, sem baseline" };
  }

  const isUnusual = !baseline.accessHours.includes(hour);
  const isLateNight = hour >= THRESHOLDS.UNUSUAL_HOUR_START && hour <= THRESHOLDS.UNUSUAL_HOUR_END;

  if (isUnusual && isLateNight) {
    const score = 65;
    await alertAnomaly(
      userId,
      "Horário Incomum de Acesso",
      `Usuário geralmente acessa entre ${Math.min(...baseline.accessHours)}h-${Math.max(...baseline.accessHours)}h\nLogin detectado às ${hour}h (madrugada)`,
      score,
    );

    return { anomaly: true, type: "unusual_hour", score, baseline: baseline.accessHours, detected: hour };
  }

  return { anomaly: false };
}

async function detectAbnormalVolume(userId) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as count
      FROM audit_logs
      WHERE user_id = $1
        AND timestamp > NOW() - INTERVAL '1 minute'`,
      [userId],
    );

    const recentRequests = parseInt(result.rows[0].count);

    if (recentRequests > THRESHOLDS.MAX_REQUESTS_PER_MINUTE) {
      const score = 90;
      await alertAnomaly(
        userId,
        "Volume Anormal de Requisições",
        `${recentRequests} requisições no último minuto (limite: ${THRESHOLDS.MAX_REQUESTS_PER_MINUTE})`,
        score,
      );

      return { anomaly: true, type: "abnormal_volume", score, detected: recentRequests, threshold: THRESHOLDS.MAX_REQUESTS_PER_MINUTE };
    }

    return { anomaly: false };
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao detectar volume:", error);
    return { anomaly: false, error: error.message };
  }
}

async function detectMultipleIPs(userId) {
  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT ip_address) as ip_count
      FROM active_sessions
      WHERE user_id = $1
        AND created_at > NOW() - INTERVAL '1 hour'
        AND is_active = TRUE`,
      [userId],
    );

    const ipCount = parseInt(result.rows[0].ip_count);

    if (ipCount >= 3) {
      const score = 70;
      await alertAnomaly(
        userId,
        "Múltiplos IPs Detectados",
        `${ipCount} IPs diferentes na última hora (possível compartilhamento de conta)`,
        score,
      );

      return { anomaly: true, type: "multiple_ips", score, detected: ipCount };
    }

    return { anomaly: false };
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao detectar múltiplos IPs:", error);
    return { anomaly: false, error: error.message };
  }
}

async function detectMultipleDevices(userId) {
  try {
    const result = await pool.query(
      `SELECT
        COUNT(DISTINCT device_name) as device_count,
        ARRAY_AGG(DISTINCT device_name) as devices
      FROM active_sessions
      WHERE user_id = $1
        AND is_active = TRUE
        AND last_activity_at > NOW() - INTERVAL '5 minutes'`,
      [userId],
    );

    const deviceCount = parseInt(result.rows[0].device_count);

    if (deviceCount >= 3) {
      const score = 60;
      await alertAnomaly(
        userId,
        "Múltiplos Dispositivos Simultâneos",
        `${deviceCount} dispositivos ativos nos últimos 5 minutos`,
        score,
      );

      return { anomaly: true, type: "multiple_devices", score, detected: deviceCount, devices: result.rows[0].devices };
    }

    return { anomaly: false };
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao detectar múltiplos dispositivos:", error);
    return { anomaly: false, error: error.message };
  }
}

async function detectBruteForce(userId) {
  try {
    const result = await pool.query(
      `SELECT COUNT(*) as failed_count
      FROM audit_logs
      WHERE user_id = $1
        AND operation = 'login_failure'
        AND timestamp > NOW() - INTERVAL '1 hour'`,
      [userId],
    );

    const failedCount = parseInt(result.rows[0].failed_count);

    if (failedCount >= THRESHOLDS.MAX_FAILED_LOGINS_PER_HOUR) {
      const score = 95;
      await alertAnomaly(
        userId,
        "Possível Ataque de Força Bruta",
        `${failedCount} tentativas de login falhadas na última hora`,
        score,
      );

      return { anomaly: true, type: "brute_force", score, detected: failedCount, threshold: THRESHOLDS.MAX_FAILED_LOGINS_PER_HOUR };
    }

    return { anomaly: false };
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao detectar força bruta:", error);
    return { anomaly: false, error: error.message };
  }
}

async function detectAnomalies(userId, sessionData = {}) {
  console.log(`[AnomalyDetection] Verificando anomalias para: ${userId}`);

  const results = { userId, timestamp: new Date(), anomalies: [], totalScore: 0 };

  try {
    const [newCountry, unusualHour, abnormalVolume, multipleIPs, multipleDevices, bruteForce] = await Promise.all([
      detectNewCountry(userId, sessionData.country),
      detectUnusualHour(userId, new Date().getHours()),
      detectAbnormalVolume(userId),
      detectMultipleIPs(userId),
      detectMultipleDevices(userId),
      detectBruteForce(userId),
    ]);

    [newCountry, unusualHour, abnormalVolume, multipleIPs, multipleDevices, bruteForce].forEach((result) => {
      if (result.anomaly) {
        results.anomalies.push(result);
        results.totalScore += result.score || 0;
      }
    });

    if (results.anomalies.length > 0) {
      results.totalScore = Math.min(100, results.totalScore / results.anomalies.length);

      for (const anomaly of results.anomalies) {
        try {
          await pool.query(
            `INSERT INTO audit_logs (user_id, username, operation, details, ip_address, status)
            VALUES ($1, $1, 'anomaly_detected', $2, $3, 'warning')`,
            [userId, JSON.stringify(anomaly), sessionData.ip || "Unknown"],
          );
        } catch (logError) {
          console.error("[AnomalyDetection] Erro ao registrar no audit_logs:", logError);
        }
      }
    }

    console.log(`[AnomalyDetection] ${results.anomalies.length} anomalias detectadas (score: ${results.totalScore.toFixed(1)})`);
    return results;
  } catch (error) {
    console.error("[AnomalyDetection] Erro ao detectar anomalias:", error);
    return { userId, timestamp: new Date(), anomalies: [], totalScore: 0, error: error.message };
  }
}

async function startAnomalyMonitoring(intervalMinutes = 15) {
  console.log(`[AnomalyDetection] Monitoramento iniciado (intervalo: ${intervalMinutes}min)`);

  setInterval(async () => {
    try {
      console.log("[AnomalyDetection] Executando verificação periódica...");

      const result = await pool.query(`
        SELECT DISTINCT user_id
        FROM active_sessions
        WHERE last_activity_at > NOW() - INTERVAL '24 hours'
      `);

      for (const row of result.rows) {
        await detectAnomalies(row.user_id);
      }

      console.log(`[AnomalyDetection] Verificação concluída (${result.rows.length} usuários)`);
    } catch (error) {
      console.error("[AnomalyDetection] Erro no monitoramento:", error);
    }
  }, intervalMinutes * 60 * 1000);

  setTimeout(async () => {
    try {
      const result = await pool.query(`
        SELECT DISTINCT user_id
        FROM active_sessions
        WHERE last_activity_at > NOW() - INTERVAL '24 hours'
      `);

      for (const row of result.rows) {
        await detectAnomalies(row.user_id);
      }
    } catch (error) {
      console.error("[AnomalyDetection] Erro na verificação inicial:", error);
    }
  }, 5000);
}

module.exports = {
  detectNewCountry,
  detectUnusualHour,
  detectAbnormalVolume,
  detectMultipleIPs,
  detectMultipleDevices,
  detectBruteForce,
  detectAnomalies,
  startAnomalyMonitoring,
  getUserBaseline,
  mean,
  stdDev,
  zScore,
  isOutlier,
};
