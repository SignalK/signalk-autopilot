/*
 * Copyright 2022 Teppo Kurki <teppo.kurki@iki.fi>
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const { SUCCESS_RES, FAILURE_RES, STATES } = require("./const");
const { AUTO, WIND, STANDBY, ROUTE } = STATES;

const state_path = "steering.autopilot.state.value";

module.exports = function (app) {
  const pilot = {};
  let interval;

  pilot.start = (props) => {
    if (process.env.SIMRAD_AP_AUTOPILOT_STATE) {
      interval = setInterval(
        () =>
          app.handleMessage(undefined, {
            updates: [
              {
                values: [
                  {
                    path: "steering.autopilot.state",
                    value: process.env.SIMRAD_AP_AUTOPILOT_STATE,
                  },
                ],
              },
            ],
          }),
        1000
      );
    }
  };

  pilot.stop = () => {
    if (interval) {
      clearInterval(interval);
    }
  };

  pilot.putTargetHeading = (context, path, value, cb) => {
    return FAILURE_RES;
  };

  pilot.putState = (context, path, value, cb) => {
    const eventName = SK_STATE_TO_SIMRAD_EVENT_NAME[value];
    if (eventName) {
      app.emit("nmea2000JsonOut", {
        prio: 2,
        pgn: 130850,
        dst: 255,
        fields: {
          "Proprietary ID": 0,
          "Controlling Device": 10,
          Event: eventName,
        }
      });
      return SUCCESS_RES;
    } else {
      console.error(`No change event name found for ${value}`);
      return FAILURE_RES;
    }
  };

  pilot.putTargetWind = (context, path, value, cb) => {
    return SUCCESS_RES;
  };

  pilot.putAdjustHeading = (context, path, value, cb) => {
    const state = app.getSelfPath(state_path);

    if (state !== "auto" && state !== "wind") {
      return { message: "Autopilot not in auto or wind mode", ...FAILURE_RES };
    } else {
      let pgnData;
      console.log(value);
      switch (value) {
        case 10:
          pgnData = ADJUST_HEADING_COMMANDS[value];
          break;
        case -10:
          pgnData = ADJUST_HEADING_COMMANDS[value];
          break;
        case 1:
          pgnData = ADJUST_HEADING_COMMANDS[value];
          break;
        case -1:
          pgnData = ADJUST_HEADING_COMMANDS[value];
          break;
        default:
          return { message: `Invalid adjustment: ${value}`, ...FAILURE_RES };
      }

      app.emit("nmea2000JsonOut", pgnData);
      return SUCCESS_RES;
    }
  };

  pilot.putTack = (context, path, value, cb) => {
    const state = app.getSelfPath(state_path);

    if (state !== "wind") {
      return { message: "Autopilot not in wind vane mode", ...FAILURE_RES };
    } else {
      return SUCCESS_RES;
    }
  };

  pilot.putAdvanceWaypoint = (context, path, value, cb) => {
    const state = app.getSelfPath(state_path);

    if (state !== "route") {
      return { message: "Autopilot not in track mode", ...FAILURE_RES };
    } else {
      return SUCCESS_RES;
    }
  };

  pilot.sendCommand = (req, res) => {
    if (typeof deviceid != "undefined") {
      sendCommand(app, deviceid, req.body);
      res.send("Executed command");
    }
  };

  pilot.properties = () => {
    return {};
  };

  return pilot;
};

const ADJUST_HEADING_COMMANDS = {
  1: {
    pgn: 130850,
    dst: 255,
    fields: {
      "Manufacturer Code": "Simrad",
      "Industry Code": "Marine Industry",
      "Proprietary ID": 0,
      "Controlling Device": 10,
      Event: "Change Course",
      Direction: "Starboard",
      Angle: 0.0174,
    },
    description: "Simnet: Event Command: AP command",
  },
  10: {
    pgn: 130850,
    dst: 255,
    fields: {
      "Manufacturer Code": "Simrad",
      "Industry Code": "Marine Industry",
      "Proprietary ID": 0,
      "Controlling Device": 10,
      Event: "Change Course",
      Direction: "Starboard",
      Angle: 0.1745,
    },
    description: "Simnet: Event Command: AP command",
  },
  "-10": {
    pgn: 130850,
    dst: 255,
    fields: {
      "Manufacturer Code": "Simrad",
      "Industry Code": "Marine Industry",
      "Proprietary ID": 0,
      "Controlling Device": 10,
      Event: "Change Course",
      Direction: "Port",
      Angle: 0.1745,
    },
    description: "Simnet: Event Command: AP command",
  },
  "-1": {
    pgn: 130850,
    dst: 255,
    fields: {
      "Manufacturer Code": "Simrad",
      "Industry Code": "Marine Industry",
      "Proprietary ID": 0,
      "Controlling Device": 10,
      Event: "Change Course",
      Direction: "Port",
      Angle: 0.0174,
    },
    description: "Simnet: Event Command: AP command",
  },
};

const SK_STATE_TO_SIMRAD_EVENT_NAME = {
  [AUTO]: "Auto",
  [ROUTE]: "Nav mode",
  [WIND]: "Wind mode",
  [STANDBY]: "Standby",
};
