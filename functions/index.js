/**
 * functions/index.js — Firebase Cloud Functions entry point
 *
 * ⚠️ IMPORTANTE: Scheduled Cloud Functions requerem o plano Blaze (pay-as-you-go) do Firebase.
 * O plano Spark (gratuito) NÃO suporta funções agendadas.
 * Para deploy: firebase deploy --only functions
 *
 * Configuração SMTP necessária antes do deploy:
 *   firebase functions:config:set \
 *     smtp.host="smtp.example.com" \
 *     smtp.port="587" \
 *     smtp.user="user@example.com" \
 *     smtp.pass="sua-senha" \
 *     smtp.from="noreply@doit.com.br"
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// Initialize Firebase Admin SDK (uses default credentials in Cloud Functions environment)
admin.initializeApp();

const { executeWeeklyEmail } = require("./weekly-email");

/**
 * Scheduled Cloud Function: sendWeeklyEmail
 *
 * Runs every Monday at 08:00 AM (America/Sao_Paulo timezone).
 * Reads client follow-up data from RTDB, identifies overdue and upcoming
 * follow-ups, and sends a summary email to implantacao@doit.com.br.
 *
 * Cron expression: 0 8 * * 1
 *   - 0: minute 0
 *   - 8: hour 8 (08:00)
 *   - * * 1: every Monday
 *
 * Timezone: America/Sao_Paulo (UTC-3)
 */
exports.sendWeeklyEmail = functions.pubsub
  .schedule("0 8 * * 1")
  .timeZone("America/Sao_Paulo")
  .onRun(async (context) => {
    functions.logger.info("[WeeklyEmail] Iniciando envio do relatório semanal...");

    try {
      const result = await executeWeeklyEmail();
      functions.logger.info("[WeeklyEmail] Processo concluído com sucesso.", result);
      return result;
    } catch (error) {
      functions.logger.error("[WeeklyEmail] Processo falhou após todas as tentativas.", {
        error: error.message,
        stack: error.stack,
      });
      // Do not throw — Cloud Functions scheduler will retry on its own if we throw,
      // but we already handle retries internally with 10-min intervals.
      return { sent: false, error: error.message };
    }
  });
