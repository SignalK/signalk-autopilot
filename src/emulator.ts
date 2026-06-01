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
const routeTrackMagneticPath =
  'navigation.course.calcValues.bearingTrackMagnetic.value'
const routeXtePath = 'navigation.course.calcValues.crossTrackError.value'
const defaultRouteXteLookahead = 100
const defaultRouteMaxXteCorrection = 60

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 } as ActionResult
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 } as ActionResult

const source = 'emulator'

export default function (app: any): Autopilot {
  let currentState = 'standby'
  let currentTarget: any = undefined
  let stateInterval: any
  let routeXteLookahead = defaultRouteXteLookahead
  let routeMaxXteCorrection = degsToRad(defaultRouteMaxXteCorrection)

  const pilot: Autopilot = {
    id: 10,
    start: (props) => {
      routeXteLookahead =
        positiveFinite(props?.routeXteLookahead) || defaultRouteXteLookahead
      routeMaxXteCorrection = degsToRad(
        positiveFinite(props?.routeMaxXteCorrection) ||
          defaultRouteMaxXteCorrection
      )

      stateInterval = setInterval(() => {
        const delta = {
          updates: [
            {
              values: [
                { path: 'steering.autopilot.state', value: currentState },
                { path: 'steering.autopilot.mode', value: currentState }
              ]
            }
          ]
        }
        if (currentState === 'route') {
          currentTarget = getRouteTargetHeading()
        }
        if ((currentState === 'auto' || currentState === 'route') && currentTarget !== undefined) {
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
        { name: 'wind', engaged: true },
        { name: 'route', engaged: true }
      ]
    },

    modes: () => {
      return ['auto', 'wind', 'route']
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
        if (res.state !== 'COMPLETED') {
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
        if (res.state !== 'COMPLETED') {
          reject(new Error(res.message))
        } else {
          resolve()
        }
      })
    },

    putState: (context: string, path: string, value: any, _cb: any) => {
      const delta = {
        updates: [
          {
            values: [
              { path: 'steering.autopilot.state', value },
              { path: 'steering.autopilot.mode', value }
            ]
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
      } else if (value === 'route') {
        const heading = getRouteTargetHeading()
        if (heading !== undefined) {
          currentTarget = heading
          delta.updates[0].values.push({
            path: 'steering.autopilot.target.headingMagnetic',
            value: heading
          })
        } else {
          return {
            message: 'No magnetic route bearing available',
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

      if (state !== 'auto' && state !== 'wind' && state !== 'route') {
        return {
          message: 'Autopilot not in auto, wind or route mode',
          ...FAILURE_RES
        }
      } else if (state === 'auto' || state === 'route') {
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

    putTack: (_context: string, _path: string, value: any, _cb: any) => {
      const state = app.getSelfPath(state_path)
      if (state !== 'wind' && state !== 'auto') {
        return { message: 'Autopilot not in wind or auto mode', ...FAILURE_RES }
      }
      if (value !== 'port' && value !== 'starboard') {
        return { message: `Invalid tack direction: ${value}`, ...FAILURE_RES }
      }
      return SUCCESS_RES
    },

    putAdvanceWaypoint: (
      _context: string,
      _path: string,
      _value: any,
      _cb: any
    ) => {
      const state = app.getSelfPath(state_path)
      if (state !== 'route') {
        return { message: 'Autopilot not in route/track mode', ...FAILURE_RES }
      }
      return SUCCESS_RES
    },

    properties: () => {
      return {
        routeXteLookahead: {
          type: 'number',
          title: 'Emulator route XTE lookahead distance',
          description:
            'Cross-track error distance, in meters, that produces about half the maximum route correction.',
          default: defaultRouteXteLookahead
        },
        routeMaxXteCorrection: {
          type: 'number',
          title: 'Emulator route maximum XTE correction',
          description:
            'Maximum heading correction applied in route mode, in degrees.',
          default: defaultRouteMaxXteCorrection
        }
      }
    }
  }

  return pilot

  function getRouteTargetHeading() {
    const trackHeadingMagnetic = app.getSelfPath(routeTrackMagneticPath)
    if (!Number.isFinite(trackHeadingMagnetic)) {
      return undefined
    }

    const xte = app.getSelfPath(routeXtePath)
    if (!Number.isFinite(xte)) {
      return compassAngle(trackHeadingMagnetic)
    }

    const correction = clamp(
      -Math.atan(xte / routeXteLookahead),
      -routeMaxXteCorrection,
      routeMaxXteCorrection
    )
    return compassAngle(trackHeadingMagnetic + correction)
  }
}

function degsToRad(degrees: number) {
  return degrees * (Math.PI / 180.0)
}

function compassAngle(angle: number) {
  return ((angle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function positiveFinite(value: any) {
  return Number.isFinite(value) && value > 0 ? value : undefined
}
