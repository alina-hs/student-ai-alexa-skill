"use strict";

const axios = require("axios");
const xmlParser = require("xml2js");
const { promisify } = require("util");
const admin = require("firebase-admin");
const ical = require("node-ical").async;
let serviceAccount;
try {
  serviceAccount = require("../credentials-firebase.json");
} catch {}

admin.initializeApp({
  credential: serviceAccount ? admin.credential.cert(serviceAccount) : admin.credential.applicationDefault(),
});

const db = admin.firestore();
const xmlParserStringAsync = promisify(xmlParser.parseString);

const BLOCK_TIME_ASSIGNMENT = { 8: "1. Block", 9: "2. Block", 11: "3. Block", 14: "4. Block", 15: "5. Block" };

const getOrCreateUser = async (userData) => {
  const userRef = db.collection("users").doc(userData.email);
  const doc = await userRef.get();
  if (doc.exists) {
    return doc.data();
  } else {
    await userRef.set(userData);
    return userData;
  }
};

const setDefaultCanteen = async (email, canteen) => db.collection("users").doc(email).set({ canteen }, { merge: true });

const getAppointments = async (telegramChatId) => {
  const userRef = db.collection("users").doc(telegramChatId.toString());
  const doc = await userRef.get();

  if (doc.exists) {
    return doc.data()?.appointments ?? [];
  } else {
    return null;
  }
};

const getNewsFeedForIwi = async () => {
  const { data } = await axios.get("https://www.iwi.hs-karlsruhe.de/intranet/feed/rss/news.xml");
  return xmlParserStringAsync(data);
};

const extractNewsFromRssFeed = (rssFeed) =>
  rssFeed.rss.channel[0].item.reduce((result, item) => {
    result.push({
      title: item.title[0],
      content: item.description[0].replace("<![CDATA[ ", "").replace(" ]]>", "").replace(/<.*?>/g, " "),
    });
    return result;
  }, []);

const getNews = async () => extractNewsFromRssFeed(await getNewsFeedForIwi());

const getTimetableForDate = async (date = currentDate()) => {
  const { data } = await axios.get(
    `https://www.iwi.hs-karlsruhe.de/intranet/userfiles/File/ical_groups/WIIMv7.2-a.ics`
  );
  const directEvents = await ical.parseICS(data);
  return Object.values(directEvents)
    .filter((event) => date === event.start.toISOString().slice(0, 10))
    .map((event) => {
      event.block = BLOCK_TIME_ASSIGNMENT[event.start?.getHours() + (process.env.NODE_ENV === "production" ? 2 : 0)];
      return event;
    });
};

const getCanteenNames = async () => {
  const { data } = await axios.get("https://www.iwi.hs-karlsruhe.de/hskampus-broker/api/canteen");
  return data;
};

const _getCanteenMenus = async (id) => {
  try {
    const response = await axios.get(
      `https://www.iwi.hs-karlsruhe.de/hskampus-broker/api/canteen/${id}/date/${currentDate()}`
    );
    if (response.status !== 200) {
      return {};
    }
    return response.data[0] ?? {};
  } catch {
    return {};
  }
};

const getCanteenMenuLines = async (id) => {
  const canteenMenus = await _getCanteenMenus(id);
  if (!canteenMenus.lines) {
    return {
      name: canteenMenus.name,
    };
  }
  if (canteenMenus.lines.length === 1) {
    return {
      name: canteenMenus.name,
      line: canteenMenus.lines[0],
    };
  } else if (canteenMenus.lines.length === 0) {
    return {
      name: canteenMenus.name,
      line: [],
    };
  } else {
    return {
      name: canteenMenus.name,
      line: canteenMenus.lines.find((line) => line.name === "Linie 1") ?? [],
    };
  }
};

const currentDate = () => new Date().toISOString().slice(0, 10);

const arrayToMap = (array, key) =>
  array.reduce((map, element) => {
    map[element[key]] = element;
    return map;
  }, {});

const saveAppointmentForUser = async (email, appointmentData) => {
  const userRef = db.collection("users").doc(email.toString());
  const doc = await userRef.get();
  if (!doc.empty) {
    if (doc.data().appointments) {
      return doc._ref.update({
        appointments: admin.firestore.FieldValue.arrayUnion({
          id: Math.floor(Math.random() * 100000000),
          ...appointmentData,
        }),
      });
    } else {
      return doc._ref.update({
        appointments: [
          {
            id: Math.floor(Math.random() * 100000000),
            ...appointmentData,
          },
        ],
      });
    }
  } else {
    return null;
  }
};

const getAllCoursesAndFaculties = async () => {
  // Get all timetables from HS API
  const result = await axios.get("https://www.iwi.hs-karlsruhe.de/hskampus-broker/api/semesters/");
  // Build data structure faculty - course - semester
  const coursesByFaculty = result.data.reduce((result, current) => {
    // ignore entries without faculty (api specific)
    if (!current.course?.faculty?.id) {
      return result;
    }
    // map entries for course wirtschaftsinformatik --> bad designed API
    if (current.iCalFileHttpLink?.includes("WIIM")) {
      current.course.name = "Wirtschaftsinformatik (Master)";
    } else if (current.iCalFileHttpLink?.includes("WIIB")) {
      current.course.name = "Wirtschaftsinformatik (Bachelor)";
    } else if (current.iCalFileHttpLink?.includes("IIBB")) {
      current.course.name = "International IT Business (Bachelor)";
    } else if (current.iCalFileHttpLink?.includes("DSCB")) {
      return result;
    }
    // Cut length of course name because of restriction in telegraf
    current.course.name = current.course.name.slice(0, 45);
    const faculty = current.course.faculty.id;
    // Build data structure - start with faculty
    if (result[faculty]) {
      // Faculty already exists
      if (result[faculty][current.course.name]) {
        // Course already exists - e.g. Wirtschaftsinformatik
        // Ignore already added semesters
        if (
          result[faculty][current.course.name].filter((entry) => entry.semester === current.semesterNumber).length > 0
        ) {
          return result;
        }
        // Add semester to course
        result[faculty][current.course.name].push({
          id: current.id,
          semester: current.semesterNumber,
          iCalLink: current.iCalFileHttpLink,
          name: current.name,
        });
        // New course in same faculty
      } else {
        result[faculty][current.course.name] = [
          {
            id: current.id,
            semester: current.semesterNumber,
            iCalLink: current.iCalFileHttpLink,
            name: current.name,
          },
        ];
      }
    } else {
      // new faculty
      result[faculty] = {
        [current.course.name]: [
          {
            id: current.id,
            semester: current.semesterNumber,
            iCalLink: current.iCalFileHttpLink,
            name: current.name,
          },
        ],
      };
    }
    return result;
  }, {});
  const allFaculties = [
    ...new Set(
      result.data
        .reduce((result, current) => {
          try {
            result.push(current.course?.faculty.id);
          } catch (err) {}
          return result;
        }, [])
        .filter((row) => row)
    ),
  ];
  return {
    allFaculties,
    coursesByFaculty,
  };
};

module.exports = {
  getNews,
  getCanteenNames,
  arrayToMap,
  getCanteenMenuLines,
  getOrCreateUser,
  setDefaultCanteen,
  getTimetableForDate,
  currentDate,
  getAllCoursesAndFaculties,
  getAppointments,
  saveAppointmentForUser,
};
