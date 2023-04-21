"use strict";

const { App } = require("jovo-framework");
const { Alexa } = require("jovo-platform-alexa");
const { GoogleAssistant } = require("jovo-platform-googleassistant");
const { JovoDebugger } = require("jovo-plugin-debugger");
const axios = require("axios");
const {
  getNews,
  getCanteenNames,
  arrayToMap,
  getCanteenMenuLines,
  getOrCreateUser,
  setDefaultCanteen,
  getTimetableForDate,
  getAppointments,
  saveAppointmentForUser,
} = require("./util");

const app = new App();

app.use(new Alexa(), new GoogleAssistant(), new JovoDebugger());

const addFeaturesToSpeech = (speech) =>
  speech
    .addBreak("300ms")
    .addText("Intranet-News abrufen, ")
    .addBreak("100ms")
    .addText("Stundenplan einsehen, ")
    .addBreak("100ms")
    .addText("Mensamahlzeiten vorlesen, ")
    .addBreak("100ms")
    .addText("Termine mit Professor vereinbaren und bestehende Termine vorlesen,")
    .addBreak("100ms")
    .addText("Standardmensa auswählen.");
module.exports = { app };

app.setHandler({
  LAUNCH() {
    return this.toIntent("WelcomeUserIntent");
  },

  async WelcomeUserIntent() {
    const accountLinkingMessage = () => {
      this.$alexaSkill.showAccountLinkingCard();
      this.$speech.addText("Willkommen zum Student AI. Ich kann dich bei den folgenden Dingen unterstützen:");
      addFeaturesToSpeech(this.$speech);
      this.$speech.addText(
        "Damit ich dir dabei helfen kann, musst du dich zuerst in der Alexa-App auf deinem Smartphone anmelden. Bis gleich."
      );
      this.tell(this.$speech);
    };
    const token = this.$request.getAccessToken();
    if (token) {
      let userInformation;
      try {
        userInformation = (
          await axios.get("https://dev-v994ag65.eu.auth0.com/userinfo", {
            headers: {
              authorization: `Bearer ${token}`,
            },
          })
        ).data;
      } catch {}
      if (userInformation) {
        const userDataAuth0 = {
          givenName: userInformation.given_name ? userInformation.given_name : "",
          familyName: userInformation.family_name ? userInformation.family_name : "",
          email: userInformation.email ? userInformation.email : "",
        };
        this.$session.$data.user = await getOrCreateUser(userDataAuth0);

        this.$speech.addText(
          `Willkommen zurück ${
            this.$session.$data.user.givenName
              ? this.$session.$data.user.givenName
              : ""
          }, schön dich wieder zu sehen. Wie kann ich dir helfen?`
        );
        return this.followUpState("WhatToDoNextState").ask(this.$speech);
      } else {
        return accountLinkingMessage();
      }
    } else {
      return accountLinkingMessage();
    }
  },

  WhatToDoNextState: {
    YesIntent() {
      return this.ask("Wie kann ich dir helfen?");
    },
    BookAppointmentIntent() {
      return this.toStatelessIntent("BookAppointmentIntent");
    },
    HelpIntent() {
      return this.toStatelessIntent("HelpIntent");
    },
    NewsFeedIntent() {
      return this.toStatelessIntent("NewsFeedIntent");
    },
    TimetableIntent() {
      return this.toStatelessIntent("TimetableIntent");
    },
    CanteenIntent() {
      return this.toStatelessIntent("CanteenIntent");
    },
    async SetDefaultCanteenIntent() {
      const canteenNames = await getCanteenNames();
      const canteens = (this.$session.$data.canteens = arrayToMap(canteenNames, "id"));
      const canteenNumber = this.$inputs.canteenNumber.value;
      if (canteenNumber) {
        if (Number.isNaN(canteenNumber) || !canteens[canteenNumber]) {
          this.$speech.addText(
            "Diese Mensa existiert leider nicht. Soll ich dir die verfügbaren Mensen nochmal vorlesen?"
          );
          return this.followUpState("WrongMensaState").ask(this.$speech);
        }
        this.$session.$data.user.canteen = canteenNumber;
        await setDefaultCanteen(this.$session.$data.user.email, canteenNumber);
        this.$speech
          .addText(`Standardmensa ist jetzt Mensa ${canteens[canteenNumber].name}.`)
          .addBreak("100ms")
          .addText("Soll ich dir den heutigen Essensplan vorlesen?");
        return this.followUpState("AfterDefaultCanteenState").ask(this.$speech);
      }
      this.$speech.addText("Alles klar, du kannst aus folgenden Mensen wählen: ");
      canteenNames.forEach((canteen) => {
        this.$speech.addBreak("100ms").addText(`${canteen.id}`).addBreak("50ms").addText(`${canteen.name}`);
      });
      this.$speech.addBreak("200ms").addText(`. Sage beispielsweise Mensa 1 auswählen.`);
      this.followUpState("DefaultCanteenState").ask(this.$speech);
    },
    CancelIntent() {
      return this.tell("Wünsche dir noch einen schönen Tag!");
    },
    viewAppointmentWithProfIntent() {
      return this.toStatelessIntent("viewAppointmentWithProfIntent");
    },
    Unhandled() {
      this.$speech
        .addText("Das habe ich leider nicht richtig verstanden oder die Funktion wird noch nicht unterstützt.")
        .addText("Falls du nicht weiter weißt, sage einfach: Kannst du mir helfen?");
      this.ask(this.$speech);
    },
    Fallback() {
      this.$speech
        .addText("Das habe ich leider nicht richtig verstanden oder die Funktion wird noch nicht unterstützt.")
        .addText("Falls du nicht weiter weißt, sage einfach: Kannst du mir helfen?");
      this.ask(this.$speech);
    },
    NoIntent() {
      this.tell("Alles klar. Dann wünsche ich dir noch einen schönen Tag und bis bald.");
    },
    END() {
      return this.toStatelessIntent("END");
    },
  },

  HelpIntent() {
    const token = this.$request.getAccessToken();
    if (token) {
      this.$speech.addText("Folgende Dinge habe ich schon gelernt:");
      addFeaturesToSpeech(this.$speech);
      this.ask(this.$speech);
    } else {
      this.$speech.addText("Folgende Dinge habe ich schon gelernt:");
      addFeaturesToSpeech(this.$speech);
      this.$speech.addText(
        "Damit ich dir dabei helfen kann, musst du dich zuerst in der Alexa-App auf deinem Smartphone anmelden. Bis gleich."
      );
      return this.followUpState("WhatToDoNextState").tell(this.$speech);
    }
  },

  async BookAppointmentIntent() {
    if (!this.$alexaSkill.$dialog.isCompleted()) {
      this.$alexaSkill.$dialog.delegate();
    } else if (this.$alexaSkill.$dialog.getIntentConfirmationStatus() !== "CONFIRMED") {
      const speech = `Ich verschicke die Terminanfrage an ${this.$inputs.professor.value} am ${this.$inputs.date.value} um ${this.$inputs.time.value} wegen ${this.$inputs.subject.value}. Habe ich das richtig erfasst?`;
      this.$alexaSkill.$dialog.confirmIntent(speech);
    } else if (this.$alexaSkill.$dialog.getIntentConfirmationStatus() === "CONFIRMED") {
      const appointmentTimedate = new Date(this.$inputs.date.value);
      appointmentTimedate.setHours(
        this.$inputs.time.value.slice(0, 2) - (process.env.NODE_ENV === "production" ? 2 : 0)
      );
      appointmentTimedate.setMinutes(this.$inputs.time.value.slice(3, 5));
      const appointmentData = {
        date: appointmentTimedate,
        professor: this.$inputs.professor.value,
        subject: this.$inputs.subject.value,
      };
      this.$data.appointmentData = appointmentData;
      if (!this.$session.$data.user) {
        const token = this.$request.getAccessToken();
        if (token) {
          let userInformation;
          try {
            userInformation = (
              await axios.get("https://dev-v994ag65.eu.auth0.com/userinfo", {
                headers: {
                  authorization: `Bearer ${token}`,
                },
              })
            ).data;
          } catch {}
          if (userInformation) {
            const userDataAuth0 = {
              givenName: userInformation.given_name ? userInformation.given_name : "",
              familyName: userInformation.family_name ? userInformation.family_name : "",
              email: userInformation.email ? userInformation.email : "",
            };
            this.$session.$data.user = await getOrCreateUser(userDataAuth0);
          }
        }
      }
      saveAppointmentForUser(
        this.$session.$data.user.telegramChatId ?? this.$session.$data.user.email,
        appointmentData
      ).catch((err) => {
        console.log(err);
      });
      return this.followUpState("WhatToDoNextState").ask(
        "Termin ist verschickt. Wie kann ich dir sonst noch weiter helfen?"
      );
    }
  },
  async viewAppointmentWithProfIntent() {
    const appointments = await getAppointments(
      this.$session.$data.user.telegramChatId ?? this.$session.$data.user.email
    );
    this.$speech.addText("Du hast ein Termin");
    appointments.forEach((appointment, index) => {
      if (index > 0) {
        this.$speech.addText("und");
      }
      this.$speech.addText(
        appointment.professor.firstName
          ? "mit " + appointment.professor.firstName + " " + appointment.professor.lastName
          : "mit " + appointment.professor
      );
      this.$speech.addText(
        " am " +
          appointment.date.toDate().toLocaleDateString("de", {
            timeZone: "Europe/Berlin",
            month: "numeric",
            day: "numeric",
          }) +
          " um " +
          appointment.date.toDate().toLocaleTimeString("de", { timeZone: "Europe/Berlin" }).slice(0, 5) +
          " für " +
          appointment.subject +
          (appointments.length - 1 === index ? "." : "")
      );
    });
    this.$speech.addText("Mit was kann ich dir weiter helfen?");
    return this.followUpState("WhatToDoNextState").ask(this.$speech);
  },
  async NewsFeedIntent() {
    let { news } = this.$session.$data;
    if (news) {
      news.currentNewsEntry += 1;
      this.$speech.addText("Der nächste News-Eintrag ist:");
      this.$speech
        .addBreak("200ms")
        .addText(news.data[news.currentNewsEntry].title)
        .addBreak("200ms")
        .addText("Möchtest du Details dazu haben?");

      this.followUpState("NewsFeedFollowUpState").ask(this.$speech);
    } else {
      try {
        this.$session.$data.news = news = {
          currentNewsEntry: 0,
          data: await getNews(),
        };
        this.$speech.addText("Hier die aktuellen Intranet-News:");
        this.$speech
          .addBreak("200ms")
          .addText(news.data[news.currentNewsEntry].title)
          .addBreak("200ms")
          .addText("Möchtest du Details dazu haben?");

        this.followUpState("NewsFeedFollowUpState").ask(this.$speech);
      } catch {
        this.$speech
          .addText(
            "Leider lassen sich die News der Hochschule aktuell nicht abrufen. Versuche es doch bitte später noch einmal."
          )
          .addText("Kann ich trotzdem noch etwas für dich tun?");
        return this.followUpState("WhatToDoNextState").ask(this.$speech);
      }
    }
  },
  NewsFeedFollowUpState: {
    YesIntent() {
      const { news } = this.$session.$data;
      this.$speech.addText(news.data[news.currentNewsEntry].content).addText("Möchtest du weitere News hören?");
      this.followUpState("NewsAfterDetailsState").ask(this.$speech);
    },
    NoIntent() {
      this.followUpState("NewsAfterDetailsState").ask("Möchtest du weitere News hören?");
    },
    Unhandled() {
      const speech = "Diese Frage lässt sich nur mit ja oder nein beantworten.";
      const reprompt = "Also nochmal nur für dich: Ja oder Nein?";
      this.ask(speech, reprompt);
    },
    END() {
      return this.toStatelessIntent("END");
    },
  },
  NewsAfterDetailsState: {
    YesIntent() {
      return this.toStatelessIntent("NewsFeedIntent");
    },
    NoIntent() {
      this.followUpState("WhatToDoNextState").ask("Wie kann ich dir noch weiter helfen?");
    },
    Unhandled() {
      this.ask("Diese Frage lässt sich nur mit ja oder nein beantworten.");
    },
    END() {
      return this.toStatelessIntent("END");
    },
  },
  async TimetableIntent() {
    const timetableDate = this.$inputs.timetableDate.value;
    const timetable = await getTimetableForDate(timetableDate);
    if (timetable.length === 0) {
      this.$speech.addText("Es scheint als hättest du heute frei.");
    } else {
      timetable.forEach((event) => {
        this.$speech.addText(`${event.block} ${event.summary}, `);
      });
    }
    this.$speech.addText("Wie kann ich dich weiter unterstützen?");
    return this.followUpState("WhatToDoNextState").ask(this.$speech);
  },
  async CanteenIntent() {
    const { canteen } = this.$session.$data.user;
    if (canteen) {
      const canteenFood = await getCanteenMenuLines(canteen);
      if (!Array.isArray(canteenFood.line?.meals) || canteenFood.line?.meals?.length === 0) {
        return this.followUpState("WhatToDoNextState").ask(
          "Heute gibt es kein Essen. Vielleicht ist ja Feiertag? Was kann ich noch für dich tun?"
        );
      }
      this.$speech.addText(`Heute gibt es in der Mensa ${canteenFood.name} folgendes Essen:`);
      this.$speech.addText(`${canteenFood.line.meals[0].meal}`);
      canteenFood.line.meals[1] && this.$speech.addText(`sowie ${canteenFood.line.meals[1].meal}.`);
      this.$speech.addText(`Ich wünsche dir einen guten Appetit.`);
      this.$speech.addText("Was kann ich noch für dich tun?");
      return this.followUpState("WhatToDoNextState").ask(this.$speech);
    }
    this.$speech.addText("Du hast noch keine Standardmensa festgelegt. Aus folgenden Mensen kannst du auswählen: ");
    const canteenNames = await getCanteenNames();
    canteenNames.forEach((canteen) => {
      this.$speech.addBreak("100ms").addText(`${canteen.id}`).addBreak("50ms").addText(`${canteen.name}`);
    });
    this.$session.$data.canteens = arrayToMap(canteenNames, "id");

    this.$speech.addBreak("200ms").addText(`. Sage beispielsweise Mensa 1 auswählen.`);
    this.followUpState("DefaultCanteenState").ask(this.$speech);
  },
  DefaultCanteenState: {
    async SetDefaultCanteenIntent() {
      const { canteens } = this.$session.$data;
      const canteenNumber = this.$inputs.canteenNumber.value;
      if (!canteenNumber) {
        this.$speech.addText("Du hast noch keine Standardmensa festgelegt. Aus folgenden Mensen kannst du auswählen: ");
        const canteenNames = await getCanteenNames();
        canteenNames.forEach((canteen) => {
          this.$speech.addBreak("100ms").addText(`${canteen.id}`).addBreak("50ms").addText(`${canteen.name}`);
        });
        this.$session.$data.canteens = arrayToMap(canteenNames, "id");

        this.$speech.addBreak("200ms").addText(`. Sage beispielsweise Mensa 1 auswählen.`);
        return;
      }
      if (Number.isNaN(canteenNumber) || !canteens[canteenNumber]) {
        this.$speech.addText(
          "Diese Mensa existiert leider nicht. Soll ich dir die verfügbaren Mensen nochmal vorlesen?"
        );
        return this.followUpState("WrongMensaState").ask(this.$speech);
      }
      this.$session.$data.user.canteen = canteenNumber;
      await setDefaultCanteen(this.$session.$data.user.email, canteenNumber);
      this.$speech
        .addText(`Standardmensa ist jetzt Mensa ${canteens[canteenNumber].name}.`)
        .addBreak("100ms")
        .addText("Soll ich dir den heutigen Essensplan vorlesen?");
      return this.followUpState("AfterDefaultCanteenState").ask(this.$speech);
    },
    Fallback() {
      this.ask("Ich bin mir nicht sicher, ob ich das richtig verstanden habe, sage beispielsweise Mensa 1 auswählen.");
    },
    Unhandled() {
      this.ask("Ich bin mir nicht sicher, ob ich das richtig verstanden habe, sage beispielsweise Mensa 1 auswählen.");
    },
    END() {
      return this.toStatelessIntent("END");
    },
  },

  AfterDefaultCanteenState: {
    YesIntent() {
      return this.toStatelessIntent("CanteenIntent");
    },
    NoIntent() {
      return this.followUpState("WhatToDoNextState").ask("Alles klar, was kann ich noch für dich tun?");
    },
  },

  WrongMensaState: {
    async YesIntent() {
      this.$speech.addText("Alles klar, du kannst aus folgenden Mensen wählen: ");
      const canteenNames = await getCanteenNames();
      canteenNames.forEach((canteen) => {
        this.$speech.addBreak("100ms").addText(`${canteen.id}`).addBreak("50ms").addText(`${canteen.name}`);
      });
      this.$session.$data.canteens = arrayToMap(canteenNames, "id");

      this.$speech.addBreak("200ms").addText(`. Sage beispielsweise Mensa 1 auswählen.`);
      return this.followUpState("DefaultCanteenState").ask(this.$speech);
    },
    NoIntent() {
      return this.followUpState("DefaultCanteenState").ask("Alles klar, dann sage beispielsweise Mensa 1 auswählen.  ");
    },
    Unhandled() {
      this.ask("Diese Frage lässt sich nur mit ja oder nein beantworten.");
    },
    END() {
      return this.toStatelessIntent("END");
    },
  },
  END() {
    this.tell("Noch einen schönen Tag.");
  },
  Unhandled() {
    this.followUpState("WhatToDoNextState").ask("Das habe ich leider nicht verstanden");
  },
  Fallback() {
    this.$speech
      .addText("Das habe ich leider nicht richtig verstanden oder die Funktion wird noch nicht unterstützt.")
      .addText("Falls du nicht weiter weißt, sage einfach: Kannst du mir helfen?");
    this.ask(this.$speech);
  },
});
