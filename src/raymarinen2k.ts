/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2019 Scott Bender <scott@scottbender.net>
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

import util from 'util'
import { Autopilot } from './index'
import {
  createNmeaGroupFunction,
  SeatalkPilotMode16,
  PGN_65379_SeatalkPilotMode,
  PGN_126720_Seatalk1Keystroke,
  PGN_65360_SeatalkPilotLockedHeading,
  PGN_65345_SeatalkPilotWindDatum,
  GroupFunction,
  Priority,
  SeatalkKeystroke
} from '@canboat/ts-pgns'

const state_path = 'steering.autopilot.state.value'
const hull_type_path = 'steering.autopilot.hullType'
const target_heading_path = 'steering.autopilot.target.headingMagnetic.value'
const target_wind_path = 'steering.autopilot.target.windAngleApparent.value'

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 }
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 }
const PENDING_RES = { state: 'PENDING', statusCode: 202 }

/*
const state_commands = {
    "auto":    "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,40,00,05,ff,ff",
    "wind":    "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,00,01,05,ff,ff",
    "route":   "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,80,01,05,ff,ff",
    "standby": "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,00,00,05,ff,ff"
}
    */

const state_modes: { [key: string]: SeatalkPilotMode16 } = {
  auto: SeatalkPilotMode16.AutoCompassCommanded,
  wind: SeatalkPilotMode16.VaneWindMode,
  route: SeatalkPilotMode16.TrackMode,
  standby: SeatalkPilotMode16.Standby
}

/*
const keys_code = {
    "+1":      "07,f8",
    "+10":     "08,f7",
    "-1":      "05,fa",
    "-10":     "06,f9",
    "-1-10":   "21,de",
    "+1+10":   "22,dd"
}
*/

const st_keys: { [key: string]: { key: SeatalkKeystroke; inverted: number } } =
  {
    '+1': { key: SeatalkKeystroke.Plus1, inverted: 248 },
    '+10': { key: SeatalkKeystroke.Plus10, inverted: 247 },
    '-1': { key: SeatalkKeystroke._1, inverted: 250 },
    '-10': { key: SeatalkKeystroke._10, inverted: 249 },
    '-1-10': { key: SeatalkKeystroke._1And10, inverted: 222 },
    '+1+10': { key: SeatalkKeystroke.Plus1AndPlus10, inverted: 221 }
  }

/*
const key_command = "%s,7,126720,%s,%s,22,3b,9f,f0,81,86,21,%s,ff,ff,ff,ff,ff,c1,c2,cd,66,80,d3,42,b1,c8"
const heading_command = "%s,3,126208,%s,%s,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,%s,%s"
const wind_direction_command = "%s,3,126208,%s,%s,14,01,41,ff,00,f8,03,01,3b,07,03,04,04,%s,%s"
const raymarine_ttw_Mode = "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,81,01,05,ff,ff"
const raymarine_ttw = "%s,3,126208,%s,%s,21,00,00,ef,01,ff,ff,ff,ff,ff,ff,04,01,3b,07,03,04,04,6c,05,1a,50"
*/
const hull_type_command =
  '%s,3,126208,%s,%s,19,01,00,ef,01,f8,05,01,3b,07,03,04,04,6c,05,16,50,06,%s,52,ff'

const hullTypes: {
  [key: string]: { title: string; abbrev?: string; code: string }
} = {
  sailSlowTurn: {
    title: 'Sail (slow turn)',
    abbrev: 'Sail Slow',
    code: '01'
  },
  sail: {
    title: 'Sail',
    code: '00'
  },
  sailCatamaran: {
    title: 'Sail Catamaran',
    abbrev: 'Sail Cat',
    code: '02'
  },
  power: {
    title: 'Power',
    code: '08'
  },
  powerSlowTurn: {
    title: 'Power (slow turn)',
    abbrev: 'Power Slow',
    code: '03'
  },
  powerFastTurn: {
    title: 'Power (fast turn)',
    abbrev: 'Power Fast',
    code: '05'
  }
}

const keep_alive = '%s,7,65384,%s,255,8,3b,9f,00,00,00,00,00,00'
const keep_alive2 = '%s,7,126720,%s,255,7,3b,9f,f0,81,90,00,03'

const default_src = '1'
const autopilot_dst = '204'

export default function (app: any): Autopilot {
  let deviceid: number
  const timers: any[] = []
  let discovered: number | undefined

  const pilot: Autopilot = {
    start: (props) => {
      deviceid = Number(props.deviceid)
      app.debug('props.deviceid:', deviceid)

      app.registerPutHandler('vessels.self', hull_type_path, pilot.putHullType)

      const possibleValues: any = []

      Object.keys(hullTypes).forEach((key) => {
        const type = hullTypes[key]
        possibleValues.push({
          title: type.title,
          abbrev: type.abbrev,
          value: key
        })
      })

      app.handleMessage('autopilot', {
        updates: [
          {
            values: [
              {
                path: hull_type_path,
                value: 'unknown'
              }
            ]
          },
          {
            meta: [
              {
                path: hull_type_path,
                value: {
                  displayName: 'Vessel Hull Type',
                  type: 'multiple',
                  possibleValues
                }
              }
            ]
          }
        ]
      })

      if (props.controlHead) {
        timers.push(
          setInterval(() => {
            const msg = util.format(
              keep_alive,
              new Date().toISOString(),
              default_src
            )
            app.emit('nmea2000out', msg)
          }, 1000)
        )

        timers.push(
          setInterval(() => {
            const msg = util.format(
              keep_alive2,
              new Date().toISOString(),
              default_src
            )
            app.debug('sending keep_alive: ' + msg)
            app.emit('nmea2000out', msg)
          }, 2000)
        )
      }
    },

    stop: () => {
      timers.forEach((timer) => {
        clearInterval(timer)
      })
    },

    putHullType: (context, path, value, _cb) => {
      const type = hullTypes[value]
      const state = app.getSelfPath(state_path)

      if (type === undefined) {
        return { message: 'Invalid hull type', ...FAILURE_RES }
      } else if (state !== 'standby') {
        return { message: 'Autopilot not in standby', ...FAILURE_RES }
      } else {
        const msg = util.format(
          hull_type_command,
          new Date().toISOString(),
          default_src,
          autopilot_dst,
          type.code
        )

        sendN2k([msg])
        app.handleMessage('autopilot', {
          updates: [
            {
              values: [
                {
                  path: hull_type_path,
                  value
                }
              ]
            }
          ]
        })

        return SUCCESS_RES
      }
    },

    putTargetHeadingPromise: (value: number) => {
      return new Promise((resolve, reject) => {
        const res = pilot.putTargetHeading(
          undefined,
          undefined,
          value,
          (res: any) => {
            if (res.statusCode != 200) {
              reject(new Error(res.message))
            } else {
              resolve()
            }
          }
        )
        if (res.state !== 'PENDING') {
          reject(new Error(res.message))
        }
      })
    },

    putTargetHeading: (context: string, path: string, value: any, cb: any) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'auto') {
        return { message: 'Autopilot not in auto mode', ...FAILURE_RES }
      } else {
        const new_value = Math.trunc(degsToRad(value))
        const pgn = createNmeaGroupFunction(
          GroupFunction.Command,
          new PGN_65360_SeatalkPilotLockedHeading({
            targetHeadingMagnetic: new_value
          }),
          { priority: Priority.LeaveUnchanged },
          deviceid
        )
        sendN2k([pgn])
        verifyChange(app, target_heading_path, new_value, cb)
        return PENDING_RES
      }
    },

    putStatePromise: (value: string) => {
      return new Promise((resolve, reject) => {
        const res: any = pilot.putState(
          undefined,
          undefined,
          value,
          (res: any) => {
            if (res.statusCode != 200) {
              reject(new Error(res.message))
            } else {
              resolve()
            }
          }
        )
        if (res.state !== 'PENDING') {
          reject(new Error(res.message))
        }
      })
    },

    putState: (context: string, path: string, value: any, cb: any) => {
      if (!state_modes[value]) {
        return { message: `Invalid state: ${value}`, ...FAILURE_RES }
      } else {
        //var msg = util.format(state_commands[value], (new Date()).toISOString(), default_src, deviceid)
        //sendN2k([msg])

        const pgn = createNmeaGroupFunction(
          GroupFunction.Command,
          new PGN_65379_SeatalkPilotMode({
            pilotMode: state_modes[value],
            subMode: 0xffff
          }),
          { priority: Priority.LeaveUnchanged },
          deviceid
        )

        sendN2k([pgn])
        verifyChange(app, state_path, value, cb)
        return PENDING_RES
      }
    },

    putTargetWindPromise: (value: number) => {
      return new Promise((resolve, reject) => {
        const res: any = pilot.putTargetWind(
          undefined,
          undefined,
          value,
          (res: any) => {
            if (res.statusCode != 200) {
              reject(new Error(res.message))
            } else {
              resolve()
            }
          }
        )
        if (res.state !== 'PENDING') {
          reject(new Error(res.message))
        }
      })
    },

    putTargetWind: (context: string, path: string, value: any, cb: any) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'wind') {
        return { message: 'Autopilot not in wind vane mode', ...FAILURE_RES }
      } else {
        //var new_value = Math.trunc(value * 10000)

        const pgn = createNmeaGroupFunction(
          GroupFunction.Command,
          new PGN_65345_SeatalkPilotWindDatum({
            windDatum: value
          }),
          { priority: Priority.LeaveUnchanged },
          deviceid
        )

        sendN2k([pgn])
        verifyChange(app, target_wind_path, value, cb)
        return PENDING_RES
      }
    },

    putAdjustHeadingPromise: (value: number) => {
      return new Promise((resolve, reject) => {
        const res: any = pilot.putAdjustHeading(
          undefined,
          undefined,
          value,
          () => {}
        )
        if (res.statusCode === FAILURE_RES.statusCode) {
          reject(new Error(res.message))
        } else {
          resolve()
        }
      })
    },

    putAdjustHeading: (context: string, path: string, value: any, _cb: any) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'auto' && state !== 'wind') {
        return { message: 'Autopilot not in auto or wind mode', ...FAILURE_RES }
      } else {
        let aString
        switch (value) {
          case 10:
            aString = '+10'
            break
          case -10:
            aString = '-10'
            break
          case 1:
            aString = '+1'
            break
          case -1:
            aString = '-1'
            break
          default:
            return { message: `Invalid adjustment: ${value}`, ...FAILURE_RES }
        }
        sendN2k(changeHeadingByKey(app, deviceid, aString))
        return SUCCESS_RES
      }
    },

    putTackPromise: (value: string) => {
      return new Promise((resolve, reject) => {
        const res: any = pilot.putTack(undefined, undefined, value, () => {})
        if (res.statusCode === FAILURE_RES.statusCode) {
          reject(new Error(res.message))
        } else {
          resolve()
        }
      })
    },

    putTack: (context: string, path: string, value: any, _cb: any) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'wind' && state !== 'auto') {
        return { message: 'Autopilot not in wind or auto mode', ...FAILURE_RES }
      } else {
        sendN2k(tackTo(app, deviceid, { value: value }))
        return SUCCESS_RES
      }
    },

    putAdvanceWaypoint: (
      _context: string,
      _path: string,
      _value: any,
      _cb: any
    ) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'route') {
        return { message: 'Autopilot not in track mode', ...FAILURE_RES }
      } else {
        sendN2k(advanceWaypoint(app, deviceid))
        return SUCCESS_RES
      }
    },

    properties: () => {
      let defaultId = deviceid ?? '205'
      let description = 'No EV-1 Found'

      app.debug('***pre-discovery -> defaultId', defaultId)

      if (!discovered) {
        //let full = app.deltaCache.buildFull(undefined, [ 'sources' ])
        //if ( full && full.sources ) {
        const sources: any = app.getPath('/sources')
        if (sources) {
          Object.values(sources).forEach((v: any) => {
            if (typeof v === 'object') {
              Object.keys(v).forEach((id) => {
                if (
                  v[id] &&
                  v[id].n2k &&
                  v[id].n2k.hardwareVersion &&
                  v[id].n2k.hardwareVersion.startsWith(
                    'Raymarine EV-1 Course Computer'
                  )
                ) {
                  discovered = Number(id)
                }
              })
            }
          })
        }
      }

      if (discovered) {
        defaultId = discovered
        description = `Discovered an EV-1 with id ${discovered}`
        app.debug(description)
      }

      app.debug('*** post-discovery -> defaultId', defaultId)

      return {
        deviceid: {
          type: 'string',
          title: 'Raymarine NMEA2000 ID',
          description,
          default: defaultId
        },
        controlHead: {
          type: 'boolean',
          title:
            'Act as the Raymarine p70 control head (WARNING: unknown consequences)',
          default: false
        }
      }
    }
  }

  function sendN2k(msgs: any[]) {
    app.debug('n2k_msg: ' + JSON.stringify(msgs))
    msgs.map(function (msg) {
      if (typeof msg === 'string') {
        app.emit('nmea2000out', msg)
      } else {
        app.emit('nmea2000JsonOut', msg)
      }
    })
  }

  return pilot
}

function tackTo(app: any, deviceid: number, command_json: any) {
  const tackTo = command_json['value']
  app.debug('tackTo: ' + tackTo)
  let key
  if (tackTo === 'port') {
    key = '-1-10'
  } else if (tackTo === 'starboard') {
    key = '+1+10'
  } else {
    app.debug('tackTo: unknown ' + tackTo)
    return []
  }

  return [
    new PGN_126720_Seatalk1Keystroke({
      device: 33,
      key: st_keys[key].key,
      keyinverted: st_keys[key].inverted
    })
  ]
}

function changeHeadingByKey(app: any, deviceid: number, key: string) {
  app.debug('changeHeadingByKey: ' + key)

  return [
    new PGN_126720_Seatalk1Keystroke({
      device: 33, //??
      key: st_keys[key].key,
      keyinverted: st_keys[key].inverted
    })
  ]

  //return [util.format(key_command, (new Date()).toISOString(), default_src, everyone_dst, keys_code[key])]
}

function advanceWaypoint(app: any, deviceid: number) {
  /*
  return [util.format(raymarine_ttw_Mode, (new Date()).toISOString(),
    default_src, deviceid),
  util.format(raymarine_ttw, (new Date()).toISOString(),
    default_src, deviceid)]
    */

  const pgn = createNmeaGroupFunction(
    GroupFunction.Command,
    new PGN_65379_SeatalkPilotMode({
      pilotMode: SeatalkPilotMode16.NoDriftCogReferencedinTrackCourseChanges,
      subMode: 0xffff
    }),
    { priority: Priority.LeaveUnchanged },
    deviceid
  )
  return [pgn]
}

/*
function radsToDeg(radians: number) {
  return radians * 180 / Math.PI
}
  */

function degsToRad(degrees: number) {
  return degrees * (Math.PI / 180.0)
}

function getPilotError(app: any) {
  let message
  const notifs: any = app.getSelfPath('notifications.autopilot')
  if (notifs) {
    Object.values(notifs).forEach((info: any) => {
      if (info.state !== 'normal') {
        message = info.message
      }
    })
  }
  return message
}

function verifyChange(
  app: any,
  path: string,
  expected: any,
  cb: (res: any) => void
) {
  let retryCount = 0
  const interval = setInterval(() => {
    const val = app.getSelfPath(path)
    //app.debug('checking %s %j should be %j', path, val, expected)

    if (val !== undefined && val === expected) {
      app.debug('SUCCESS')
      cb(SUCCESS_RES)
      clearInterval(interval)
    } else {
      const message = getPilotError(app)

      if (message || retryCount++ > 5) {
        clearInterval(interval)

        const res = {
          message:
            message ||
            `Did not receive change confirmation ${val} != ${expected}`,
          ...FAILURE_RES
        }
        cb(res)
      }
    }
  }, 1000)
}
