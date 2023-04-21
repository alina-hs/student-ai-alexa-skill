// ------------------------------------------------------------------
// JOVO PROJECT CONFIGURATION
// ------------------------------------------------------------------

module.exports = {
  alexaSkill: {
    nlu: "alexa",
  },
  endpoint:
    process.env.NODE_ENV === "production"
      ? "https://europe-west3-studentai-ffbd1.cloudfunctions.net/voiceAssistantBackend"
      : "${JOVO_WEBHOOK_URL}",
};
