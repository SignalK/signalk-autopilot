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

import { Autopilot } from './index'
import { ActionResult } from '@signalk/server-api'
import {
  PGN,
  PGN_130850_SimnetCommandApHeading,
  PGN_130850_SimnetCommandApNav,
  PGN_130850_SimnetCommandApNodrift,
  PGN_130850_SimnetCommandApStandby,
  PGN_130850_SimnetCommandApTack,
  PGN_130850_SimnetCommandApWind,
  PGN_130850_SimnetCommandApChangeCourse,
  SimnetDirection,
  SimnetApCommandType
  //PGN_130850_SimnetCommandApStandby,
  //PGN_130850_SimnetCommandApFollowUp,
} from '@canboat/ts-pgns'

const state_path = 'steering.autopilot.state.value'

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 } as ActionResult
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 } as ActionResult
const PENDING_RES = { state: 'PENDING', statusCode: 202 } as ActionResult

/*
const state_command = '%s,3,130850,%s,255,11,41,9F,%s,FF,FF,0A,%s,00,FF,FF,FF'
const heading_command = '%s,2,130850,%s,255,12,41,9f,%s,ff,ff,0A,1A,00,%s,ff'
const tack_command = '%s,2,130850,%s,255,12,41,9f,%s,ff,ff,0A,11,00,00,ff,ff,ff'
const start_follow_up_command =
  '%s,2,130850,%s,255,12,41,9f,%s,ff,ff,02,0E,00,ff,ff,ff,ff'
*/

const states = [
  { name: 'standby', engaged: false },
  { name: 'auto', engaged: true },
  { name: 'wind', engaged: true },
  { name: 'route', engaged: true },
  { name: 'heading', engaged: true }
  //{ name: 'followUp', engaged: true },
  //{ name: 'nonFollowUp', engaged: true }
]

export default function (app: any): Autopilot {
  const defaultDeviceid: number = 3
  const timers: any[] = []

  const pilot: Autopilot = {
    id: defaultDeviceid,
    start: (props) => {
      if (props.simradDeviceId !== undefined) {
        //deviceid = props.deviceid
        pilot.id = Number(props.simradDeviceId)
        app.debug('props.deviceid:', pilot.id)
      }
    },

    stop: () => {
      timers.forEach((timer) => {
        clearInterval(timer)
      })
    },

    states: () => {
      return states
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

    putTargetHeading: (
      _context: string,
      _path: string,
      _value: any,
      _cb: any
    ) => {
      return { message: 'Unsupported', ...FAILURE_RES }
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
      if (!states.find((s) => s.name === value)) {
        return { message: `Invalid Autopilot State: ${value}`, ...FAILURE_RES }
      } else {
        /*
        if (value === 'followUp') {
          sendN2k([
            util.format(
              start_follow_up_command,
              new Date().toISOString(),
              default_src,
              padd(pilot.id.toString(16), 2)
            )
          ])
        } else if (value === 'nonFollowUp') {
          sendN2k([
            util.format(
              start_follow_up_command,
              new Date().toISOString(),
              default_src,
              padd(deviceid.toString(16), 2)
            )
          ])
        } else */ {
          let pgn: PGN

          switch (value) {
            case 'auto':
              pgn = new PGN_130850_SimnetCommandApNodrift({
                address: pilot.id,
                unknown: 0
              })
              break
            case 'route':
              pgn = new PGN_130850_SimnetCommandApNav({
                address: pilot.id,
                unknown: 0
              })
              break
            case 'heading':
              pgn = new PGN_130850_SimnetCommandApHeading({
                address: pilot.id,
                unknown: 0
              })
              break
            case 'wind':
              pgn = new PGN_130850_SimnetCommandApWind({
                address: pilot.id,
                unknown: 0
              })
              break
            default:
            case 'standby':
              pgn = new PGN_130850_SimnetCommandApStandby({
                address: pilot.id,
                unknown: 0
              })
              break
          }

          sendN2k([pgn])
        }

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

    putTargetWind: (_context: string, _path: string, _value: any, _cb: any) => {
      return { message: 'Unsupported', ...FAILURE_RES }
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

      if (state !== 'auto' && state !== 'heading' && state !== 'wind') {
        return {
          message: 'Autopilot not in auto, heading or wind mode',
          ...FAILURE_RES
        }
      } else {
        const pgn = new PGN_130850_SimnetCommandApChangeCourse({
          address: pilot.id,
          commandType: SimnetApCommandType.ApCommand,
          unknown: 0,
          direction:
            value > 0 ? SimnetDirection.Starboard : SimnetDirection.Port,
          angle: degsToRad(Math.abs(value))
        })
        sendN2k([pgn])
        //verifyChange(app, target_wind_path, new_value, cb)
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

    putTack: (_context: string, _path: string, _value: any, _cb: any) => {
      const state = app.getSelfPath(state_path)

      if (state !== 'wind' && state !== 'auto') {
        return { message: 'Autopilot not in wind or auto mode', ...FAILURE_RES }
      } else {
        sendN2k([
          new PGN_130850_SimnetCommandApTack({
            address: pilot.id,
            unknownA: 0,
            unknownB: 0
          })
        ])
        return SUCCESS_RES
      }
    },

    putAdvanceWaypoint: (
      _context: string,
      _path: string,
      _value: any,
      _cb: any
    ) => {
      return { message: 'Unsupported', ...FAILURE_RES }
    },

    properties: () => {
      //let defaultId = deviceid ?? '3'
      /*
      let description = 'No EV-1 Found'

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
  */
      return {
        simradDeviceId: {
          type: 'string',
          title: 'Simrad Autopilot NMEA2000 ID',
          default: '3'
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

function degsToRad(degrees: number) {
  return degrees * (Math.PI / 180.0)
}
