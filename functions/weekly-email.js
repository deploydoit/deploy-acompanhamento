/**
 * weekly-email.js — Cloud Function para envio de e-mail semanal de acompanhamento
 *
 * Schedule: toda segunda-feira às 08:00 horário de Brasília (America/Sao_Paulo)
 * Cron: 0 8 * * 1
 *
 * ⚠️ IMPORTANTE: Scheduled functions requerem plano Blaze (pay-as-you-go) do Firebase.
 * O plano Spark (gratuito) NÃO suporta Cloud Functions agendadas.
 * Para deploy, faça upgrade para Blaze: https://console.firebase.google.com/project/_/usage/details
 *
 * Configuração SMTP via variáveis de ambiente do Firebase:
 *   firebase functions:config:set smtp.host="smtp.example.com" smtp.port="587"
 *     smtp.user="user@example.com" smtp.pass="password" smtp.from="noreply@doit.com.br"
 *
 * Ou via variáveis de ambiente (Functions v2 / .env):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

const RECIPIENT_EMAIL = "implantacao@doit.com.br";
const MAX_RETRIES = 3;
const RETRY_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Get SMTP configuration from Firebase functions config or environment variables.
 * @returns {object} SMTP transport options for Nodemailer
 */
function getSmtpConfig() {
  // Try Firebase functions config first
  const config = functions.config();
  if (config.smtp && config.smtp.host) {
    return {
      host: config.smtp.host,
      port: parseInt(config.smtp.port || "587", 10),
      secure: config.smtp.port === "465",
      auth: {
        user: config.smtp.user,
        pass: config.smtp.pass,
      },
      from: config.smtp.from || config.smtp.user,
    };
  }

  // Fallback to environment variables
  return {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_PORT === "465",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
  };
}

/**
 * Calculate the Monday-to-Friday range for the current week.
 * @param {Date} [referenceDate] - Optional reference date (defaults to today)
 * @returns {{ monday: Date, friday: Date }}
 */
function getCurrentWeekRange(referenceDate) {
  const today = referenceDate || new Date();
  const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

  const monday = new Date(today);
  monday.setDate(today.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);
  friday.setHours(23, 59, 59, 999);

  return { monday, friday };
}

/**
 * Parse an ISO date string (YYYY-MM-DD) into a Date object at midnight.
 * @param {string} dateStr - ISO date string
 * @returns {Date|null}
 */
function parseDate(dateStr) {
  if (!dateStr || typeof dateStr !== "string") return null;
  const parts = dateStr.split("-");
  if (parts.length !== 3) return null;
  const [year, month, day] = parts.map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return new Date(year, month - 1, day);
}

/**
 * Calculate the number of days between two dates (ignoring time).
 * @param {Date} from
 * @param {Date} to
 * @returns {number} Positive if `to` is in the future, negative if past
 */
function daysDifference(from, to) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMidnight = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const toMidnight = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toMidnight - fromMidnight) / msPerDay);
}

/**
 * Analyze client data to find overdue follow-ups and those scheduled for the current week.
 * @param {object} clientsData - Raw clients object from RTDB { id: clientObj }
 * @param {Date} [referenceDate] - Reference date for calculations (defaults to today)
 * @returns {{ overdue: Array, weekScheduled: Array, totalOcorreu: number, totalSlots: number }}
 */
function analyzeClients(clientsData, referenceDate) {
  const today = referenceDate || new Date();
  today.setHours(0, 0, 0, 0);
  const { monday, friday } = getCurrentWeekRange(today);

  const overdue = [];
  const weekScheduled = [];
  let totalOcorreu = 0;
  let totalClients = 0;

  if (!clientsData) {
    return { overdue, weekScheduled, totalOcorreu, totalSlots: 0 };
  }

  const clients = Object.entries(clientsData);
  totalClients = clients.length;

  for (const [id, client] of clients) {
    const nome = client.nome || "Sem nome";
    const lider = client.lider || "Sem líder";
    const datasPrevistas = client.datas_previstas || [];
    const followUps = client.followUps || {};

    for (let i = 0; i < datasPrevistas.length; i++) {
      const slotDate = parseDate(datasPrevistas[i]);
      if (!slotDate) continue;

      const followUp = followUps[String(i)] || {};
      const ocorreu = followUp.ocorreu === "sim";

      if (ocorreu) {
        totalOcorreu++;
        continue;
      }

      // Check if overdue: date is before today AND not completed
      if (slotDate < today) {
        const daysLate = daysDifference(slotDate, today);
        overdue.push({
          clientId: id,
          nome,
          lider,
          daysLate,
          dataPrevista: datasPrevistas[i],
          slot: i,
        });
      }

      // Check if scheduled for current week (Mon-Fri)
      if (slotDate >= monday && slotDate <= friday) {
        weekScheduled.push({
          clientId: id,
          nome,
          lider,
          dataPrevista: datasPrevistas[i],
          slot: i,
        });
      }
    }
  }

  const totalSlots = totalClients * 4;

  return { overdue, weekScheduled, totalOcorreu, totalSlots };
}

/**
 * Group items by líder field.
 * @param {Array} items - Array of objects with `lider` field
 * @returns {object} Grouped by líder name: { liderName: [items] }
 */
function groupByLider(items) {
  const grouped = {};
  for (const item of items) {
    const lider = item.lider || "Sem líder";
    if (!grouped[lider]) {
      grouped[lider] = [];
    }
    grouped[lider].push(item);
  }
  return grouped;
}

/**
 * Format date string YYYY-MM-DD to DD/MM/YYYY for display.
 * @param {string} isoDate
 * @returns {string}
 */
function formatDateBR(isoDate) {
  if (!isoDate) return "—";
  const parts = isoDate.split("-");
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

/**
 * Build the HTML email body for the weekly report.
 * @param {object} analysis - Result from analyzeClients
 * @returns {string} HTML email content
 */
function buildEmailHtml(analysis) {
  const { overdue, weekScheduled, totalOcorreu, totalSlots } = analysis;
  const progressText = `${totalOcorreu}/${totalSlots} acompanhamentos realizados`;

  // "Tudo em dia" case: no overdue AND no scheduled for the week
  if (overdue.length === 0 && weekScheduled.length === 0) {
    return `
      <html>
      <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2e7d32;">✅ Tudo em dia!</h2>
        <p>Não há acompanhamentos atrasados nem previstos para esta semana.</p>
        <p style="font-size: 18px; font-weight: bold; color: #1565c0;">
          Progresso geral: ${progressText}
        </p>
        <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
        <p style="font-size: 12px; color: #999;">
          Este é um e-mail automático do Painel de Acompanhamento de Clientes — Time de Deploy DOit.
        </p>
      </body>
      </html>
    `;
  }

  // Build overdue section grouped by líder
  let overdueHtml = "";
  if (overdue.length > 0) {
    const overdueByLider = groupByLider(overdue);
    overdueHtml = `
      <h3 style="color: #c62828;">⚠️ Acompanhamentos Atrasados (${overdue.length})</h3>
    `;
    for (const [lider, items] of Object.entries(overdueByLider)) {
      overdueHtml += `<h4 style="color: #555; margin-bottom: 4px;">📋 ${lider}</h4>`;
      overdueHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="background: #ffebee;">
            <th style="text-align: left; padding: 6px; border-bottom: 1px solid #ddd;">Cliente</th>
            <th style="text-align: left; padding: 6px; border-bottom: 1px solid #ddd;">Data Prevista</th>
            <th style="text-align: center; padding: 6px; border-bottom: 1px solid #ddd;">Dias em Atraso</th>
          </tr>
        </thead>
        <tbody>`;
      for (const item of items) {
        overdueHtml += `
          <tr>
            <td style="padding: 6px; border-bottom: 1px solid #eee;">${item.nome}</td>
            <td style="padding: 6px; border-bottom: 1px solid #eee;">${formatDateBR(item.dataPrevista)}</td>
            <td style="text-align: center; padding: 6px; border-bottom: 1px solid #eee; color: #c62828; font-weight: bold;">${item.daysLate}</td>
          </tr>`;
      }
      overdueHtml += `</tbody></table>`;
    }
  }

  // Build week schedule section grouped by líder
  let weekHtml = "";
  if (weekScheduled.length > 0) {
    const weekByLider = groupByLider(weekScheduled);
    weekHtml = `
      <h3 style="color: #f57c00;">📅 Acompanhamentos Previstos Esta Semana (${weekScheduled.length})</h3>
    `;
    for (const [lider, items] of Object.entries(weekByLider)) {
      weekHtml += `<h4 style="color: #555; margin-bottom: 4px;">📋 ${lider}</h4>`;
      weekHtml += `<table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;">
        <thead>
          <tr style="background: #fff3e0;">
            <th style="text-align: left; padding: 6px; border-bottom: 1px solid #ddd;">Cliente</th>
            <th style="text-align: left; padding: 6px; border-bottom: 1px solid #ddd;">Data Prevista</th>
          </tr>
        </thead>
        <tbody>`;
      for (const item of items) {
        weekHtml += `
          <tr>
            <td style="padding: 6px; border-bottom: 1px solid #eee;">${item.nome}</td>
            <td style="padding: 6px; border-bottom: 1px solid #eee;">${formatDateBR(item.dataPrevista)}</td>
          </tr>`;
      }
      weekHtml += `</tbody></table>`;
    }
  }

  return `
    <html>
    <body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #1565c0;">📊 Relatório Semanal — Acompanhamento de Clientes</h2>
      <p style="font-size: 18px; font-weight: bold; color: #1565c0;">
        Progresso geral: ${progressText}
      </p>
      ${overdueHtml}
      ${weekHtml}
      <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
      <p style="font-size: 12px; color: #999;">
        Este é um e-mail automático do Painel de Acompanhamento de Clientes — Time de Deploy DOit.
      </p>
    </body>
    </html>
  `;
}

/**
 * Build plain text email subject based on content.
 * @param {object} analysis
 * @returns {string}
 */
function buildEmailSubject(analysis) {
  const { overdue, weekScheduled } = analysis;
  if (overdue.length === 0 && weekScheduled.length === 0) {
    return "✅ Acompanhamento Semanal — Tudo em dia!";
  }
  const parts = [];
  if (overdue.length > 0) parts.push(`${overdue.length} atrasado(s)`);
  if (weekScheduled.length > 0) parts.push(`${weekScheduled.length} previsto(s)`);
  return `📊 Acompanhamento Semanal — ${parts.join(", ")}`;
}

/**
 * Send email with retry logic.
 * Attempts up to MAX_RETRIES times with RETRY_INTERVAL_MS between attempts.
 * @param {object} transporter - Nodemailer transporter
 * @param {object} mailOptions - Email options (to, subject, html)
 * @param {number} [attempt=1] - Current attempt number
 * @returns {Promise<void>}
 */
async function sendWithRetry(transporter, mailOptions, attempt = 1) {
  try {
    await transporter.sendMail(mailOptions);
    functions.logger.info(
      `[WeeklyEmail] Email enviado com sucesso na tentativa ${attempt}`,
      { recipient: mailOptions.to }
    );
  } catch (error) {
    functions.logger.error(
      `[WeeklyEmail] Falha ao enviar email (tentativa ${attempt}/${MAX_RETRIES})`,
      { error: error.message, code: error.code }
    );

    if (attempt < MAX_RETRIES) {
      functions.logger.info(
        `[WeeklyEmail] Aguardando 10 minutos antes da próxima tentativa...`
      );
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
      return sendWithRetry(transporter, mailOptions, attempt + 1);
    }

    functions.logger.error(
      `[WeeklyEmail] Todas as ${MAX_RETRIES} tentativas falharam. Email não enviado.`,
      { recipient: mailOptions.to, lastError: error.message }
    );
    throw error;
  }
}

/**
 * Main function: reads client data, analyzes follow-ups, and sends the weekly email.
 * Exported for use in the Cloud Function scheduler and for testing.
 * @param {Date} [referenceDate] - Optional reference date for testing
 * @returns {Promise<object>} Result with analysis summary
 */
async function executeWeeklyEmail(referenceDate) {
  // Read client data from RTDB
  const snapshot = await admin.database().ref("clients").once("value");
  const clientsData = snapshot.val();

  if (!clientsData) {
    functions.logger.warn("[WeeklyEmail] Nenhum cliente encontrado no banco de dados.");
    return { sent: false, reason: "no_clients" };
  }

  // Analyze the data
  const analysis = analyzeClients(clientsData, referenceDate);
  functions.logger.info("[WeeklyEmail] Análise concluída", {
    overdue: analysis.overdue.length,
    weekScheduled: analysis.weekScheduled.length,
    progress: `${analysis.totalOcorreu}/${analysis.totalSlots}`,
  });

  // Configure SMTP transporter
  const smtpConfig = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    auth: smtpConfig.auth,
  });

  // Build email
  const subject = buildEmailSubject(analysis);
  const html = buildEmailHtml(analysis);

  const mailOptions = {
    from: smtpConfig.from,
    to: RECIPIENT_EMAIL,
    subject,
    html,
  };

  // Send with retry
  await sendWithRetry(transporter, mailOptions);

  return {
    sent: true,
    overdue: analysis.overdue.length,
    weekScheduled: analysis.weekScheduled.length,
    progress: `${analysis.totalOcorreu}/${analysis.totalSlots}`,
  };
}

// Export functions for Cloud Function entry point and for testing
module.exports = {
  executeWeeklyEmail,
  analyzeClients,
  groupByLider,
  buildEmailHtml,
  buildEmailSubject,
  getCurrentWeekRange,
  parseDate,
  daysDifference,
  formatDateBR,
  sendWithRetry,
  RECIPIENT_EMAIL,
  MAX_RETRIES,
  RETRY_INTERVAL_MS,
};
