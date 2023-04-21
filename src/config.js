// ------------------------------------------------------------------
// APP CONFIGURATION
// ------------------------------------------------------------------

module.exports = {
  logging: true,

  intentMap: {
    "AMAZON.StopIntent": "END",
    "AMAZON.YesIntent": "YesIntent",
    "AMAZON.NoIntent": "NoIntent",
    "AMAZON.CancelIntent": "CancelIntent",
    "AMAZON.FallbackIntent": "Fallback",
    "AMAZON.HelpIntent": "HelpIntent",
  },

  db: {
    FileDb: {
      pathToFile: "../db/db.json",
    },
  },
};
