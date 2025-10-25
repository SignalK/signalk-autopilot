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
import { ActionResult } from '@signalk/server-api'

const state_path = 'steering.autopilot.state.value'

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 } as ActionResult
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 } as ActionResult
const PENDING_RES = { state: 'PENDING', statusCode: 202 } as ActionResult

const state_command = '%s,3,130850,%s,255,11,41,9F,%s,FF,FF,0A,%s,00,FF,FF,FF'
const heading_command = '%s,2,130850,%s,255,12,41,9f,%s,ff,ff,0A,1A,00,%s,ff'
const tack_command = '%s,2,130850,%s,255,12,41,9f,%s,ff,ff,0A,11,00,00,ff,ff,ff'

const state_modes: { [key: string]: string } = {
  auto: '0c',
  wind: '0f',
  route: '0a',
  standby: '06',
  heading: '09'
}

const keys_code: { [key: string]: string } = {
  '+1': '03,AE,00',
  '+10': '03,D1,06',
  '-1': '02,AE,00',
  '-10': '02,D1,06'
}

const default_src = '1'

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
      return [
        { name: 'standby', engaged: false },
        { name: 'auto', engaged: true },
        { name: 'wind', engaged: true },
        { name: 'route', engaged: true },
        { name: 'heading', engaged: true },
        { name: 'noDrift', engaged: true }
      ]
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
      if (!state_modes[value]) {
        return { message: `Invalid Autopilot State: ${value}`, ...FAILURE_RES }
      } else {
        const msg = util.format(
          state_command,
          new Date().toISOString(),
          default_src,
          padd(pilot.id.toString(16), 2),
          state_modes[value]
        )
        sendN2k([msg])

        /*
        const pgn = new PGN_130850_SimnetEventCommandApCommand({
          address: 3,
          event: SimnetApEvents.NavMode,
          unusedB: state_modes[value],
          direction:0
        })

      
        const pgn2 = createNmeaGroupFunction(
          GroupFunction.Command,
          new PGN_65379_SeatalkPilotMode({
            pilotMode: state_modes[value],
            subMode: 0xffff
          }),
          { priority: Priority.LeaveUnchanged },
          deviceid
        )

        sendN2k([pgn])
        */
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

        sendN2k(changeHeading(app, pilot.id, aString))
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
        const msg = util.format(
          tack_command,
          new Date().toISOString(),
          default_src,
          padd(pilot.id.toString(16), 2)
        )
        sendN2k([msg])
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

function changeHeading(app: any, deviceid: number, key: string): string[] {
  const state = app.getSelfPath(state_path)
  app.debug('changeHeading: ' + state + ' ' + key)

  const n2k_msgs = [
    util.format(
      heading_command,
      new Date().toISOString(),
      default_src,
      padd(deviceid.toString(16), 2),
      keys_code[key]
    )
  ]

  /*
  if ( state == "auto" )
  {
    const variation = app.getSelfPath('navigation.magneticVariation.value')
    const current = app.getSelfPath(target_heading_path) - variation
    new_value = radsToDeg(current) + ammount

    if ( new_value < 0 ) {
      new_value = 360 + new_value
    } else if ( new_value > 360 ) {
      new_value = new_value - 360
    }
    
    app.debug(`current heading: ${radsToDeg(current)} new value: ${new_value}`)

    command_format = heading_command
  }
  else //if ( state == "wind" )
  {
    const current = app.getSelfPath(target_wind_path)
    new_value = radsToDeg(current) + ammount
    
    if ( new_value < 0 )
      new_value = 360 + new_value
    else if ( new_value > 360 )
      new_value = new_value - 360

    app.debug(`current wind angle: ${radsToDeg(current)} new value: ${new_value}`)
    command_format = wind_direction_command
  }
  new_value = Math.trunc(degsToRad(new_value) * 10000)
  n2k_msgs = [util.format(command_format, (new Date()).toISOString(), default_src,
                          padd(deviceid.toString(16), 2), padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))]
  //n2k_msgs = [ '2025-09-28T19:16:14.377Z,2,130850,5,255,12,41,9f,03,ff,ff,0A,1A,00,03,d1,06,ff' ]
  */
  return n2k_msgs
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

function padd(n: string, p: number, c?: string): string {
  const pad_char = typeof c !== 'undefined' ? c : '0'
  const pad = new Array(1 + p).join(pad_char)
  return (pad + n).slice(-pad.length)
}
