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

const state_path = 'steering.autopilot.state.value'

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 } as ActionResult
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 } as ActionResult

const source = 'autopilot-emulator'

export default function (app: any): Autopilot {
  let currentState = 'standby'
  let currentTarget: any = undefined
  let stateInterval: any

  const pilot: Autopilot = {
    id: 10,
    start: (_props) => {
      stateInterval = setInterval(() => {
        const delta = {
          updates: [
            {
              values: [
                { path: 'steering.autopilot.state', value: currentState }
              ]
            }
          ]
        }
        if (currentState === 'auto' && currentTarget !== undefined) {
          delta.updates[0].values.push({
            path: 'steering.autopilot.target.headingMagnetic',
            value: currentTarget
          })
        } else if (currentState === 'wind' && currentTarget !== undefined) {
          delta.updates[0].values.push({
            path: 'steering.autopilot.target.windAngleApparent',
            value: currentTarget
          })
        }
        app.handleMessage(source, delta)
      }, 1000)
    },

    stop: () => {
      clearInterval(stateInterval)
    },

    states: () => {
      return [
        { name: 'standby', engaged: false },
        { name: 'auto', engaged: true },
        { name: 'wind', engaged: true }
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

    putState: (context: string, path: string, value: any, _cb: any) => {
      const delta = {
        updates: [
          {
            values: [{ path: 'steering.autopilot.state', value }]
          }
        ]
      }

      if (value === 'auto') {
        const heading = app.getSelfPath('navigation.headingMagnetic.value')
        if (heading !== undefined) {
          currentTarget = heading
          delta.updates[0].values.push({
            path: 'steering.autopilot.target.headingMagnetic',
            value: heading
          })
        } else {
          return {
            message: 'No magnetic heading available',
            ...FAILURE_RES
          }
        }
      } else if (value === 'wind') {
        const windAngle = app.getSelfPath(
          'environment.wind.angleApparent.value'
        )
        if (windAngle !== undefined) {
          currentTarget = windAngle
          delta.updates[0].values.push({
            path: 'steering.autopilot.target.windAngleApparent',
            value: windAngle
          })
        } else {
          return {
            message: 'No apparent wind angle available',
            ...FAILURE_RES
          }
        }
      }

      currentState = value
      app.handleMessage(source, delta)

      return SUCCESS_RES
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
        return {
          message: 'Autopilot not in auto or wind mode',
          ...FAILURE_RES
        }
      } else if (state === 'auto') {
        const target = app.getSelfPath(
          'steering.autopilot.target.headingMagnetic.value'
        )
        const newTarget = target + degsToRad(value)
        currentTarget = newTarget

        const delta = {
          updates: [
            {
              values: [
                {
                  path: 'steering.autopilot.target.headingMagnetic',
                  value: newTarget
                }
              ]
            }
          ]
        }

        app.handleMessage(source, delta)

        return SUCCESS_RES
      } else {
        const target = app.getSelfPath(
          'steering.autopilot.target.windAngleApparent.value'
        )
        const newTarget = target + degsToRad(value)
        currentTarget = newTarget

        const delta = {
          updates: [
            {
              values: [
                {
                  path: 'steering.autopilot.target.windAngleApparent',
                  value: newTarget
                }
              ]
            }
          ]
        }

        app.handleMessage(source, delta)
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
      return { message: 'Unsupported', ...FAILURE_RES }
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
      return {}
    }
  }

  return pilot
}

function degsToRad(degrees: number) {
  return degrees * (Math.PI / 180.0)
}
