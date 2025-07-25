/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2016 Scott Bender <scott@scottbender.net>
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

import { ActionResult } from '@signalk/server-api'
import raymarinen2k from './raymarinen2k'
import raystngconv from './raystngconv'
import raymarinest from './raymarinest'

const target_heading = 'steering.autopilot.target.headingMagnetic'
const target_wind = 'steering.autopilot.target.windAngleApparent'
const state_path = 'steering.autopilot.state'
const adjust_heading = 'steering.autopilot.actions.adjustHeading'
const tack = 'steering.autopilot.actions.tack'
const advance = 'steering.autopilot.actions.advanceWaypoint'

export const types: { [key: string]: (app: any) => Autopilot } = {
  raymarineN2K: raymarinen2k,
  raymarineST: raymarinest as (app: any) => Autopilot,
  raySTNGConv: raystngconv as (app: any) => Autopilot
}

export interface Autopilot {
  start(props: any): void
  stop(): void
  putState(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  putTargetHeading(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  putTargetWind(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): any
  putAdjustHeading(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  putTack(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  putAdvanceWaypoint(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  putHullType?(
    context: string | undefined,
    path: string | undefined,
    value: any,
    cb?: any
  ): ActionResult
  properties(): any
  putStatePromise(value: string): Promise<void>
  putTargetHeadingPromise(value: number): Promise<void>
  putTargetWindPromise(value: number): Promise<void>
  putAdjustHeadingPromise(value: number): Promise<void>
  putTackPromise(value: string): Promise<void>
  //putAdvanceWaypointPromise(value: any): Promise<void>
}

export default function (app: any) {
  const plugin: any = {}
  let onStop: any[] = []
  let autopilot: Autopilot
  const pilots: { [key: string]: Autopilot } = {}

  Object.keys(types).forEach((type) => {
    const module = types[type]
    //console.log(`${type}: ${module}`)
    if (module) {
      if (typeof module !== 'function') {
        app.error(`bad ap impl ${module} ${typeof module}`)
      } else {
        pilots[type] = module(app)
      }
    }
  })

  plugin.start = function (props: any) {
    autopilot = pilots[props.type]
    autopilot.start(props)

    app.registerPutHandler('vessels.self', state_path, autopilot.putState)

    app.registerPutHandler(
      'vessels.self',
      target_heading,
      autopilot.putTargetHeading
    )

    app.registerPutHandler('vessels.self', target_wind, autopilot.putTargetWind)

    app.registerPutHandler(
      'vessels.self',
      adjust_heading,
      autopilot.putAdjustHeading
    )

    app.registerPutHandler('vessels.self', tack, autopilot.putTack)

    app.registerPutHandler(
      'vessels.self',
      advance,
      autopilot.putAdvanceWaypoint
    )

    app.handleMessage(plugin.id, {
      updates: [
        {
          meta: [
            {
              path: state_path,
              value: {
                displayName: 'Autopilot State',
                type: 'multiple',
                possibleValues: [
                  {
                    title: 'Standby',
                    value: 'standby'
                  },
                  {
                    title: 'Auto',
                    value: 'auto'
                  },
                  {
                    title: 'Wind',
                    value: 'wind'
                  },
                  {
                    title: 'Route',
                    value: 'route'
                  }
                ]
              }
            }
          ]
        }
      ]
    })

    registerProvider()
  }

  plugin.stop = function () {
    onStop.forEach((f) => f())
    onStop = []
    if (autopilot) {
      autopilot.stop()
    }
  }

  plugin.id = 'autopilot'
  plugin.name = 'Autopilot Control'
  plugin.description = 'Plugin that controls an autopilot'

  plugin.schema = function () {
    const config = {
      title: 'Autopilot Control',
      type: 'object',
      properties: {
        type: {
          type: 'string',
          title: 'Autopilot Type',
          enum: ['raymarineN2K', 'raySTNGConv', 'raymarineST'],
          enumNames: [
            'Raymarine NMEA2000',
            'Raymarine SmartPilot -> SeaTalk-STNG-Converter',
            'Raymarine Seatalk 1 AP'
          ],
          default: 'raymarineN2K'
        }
      }
    }

    Object.values(pilots).forEach((ap) => {
      if (ap && ap.properties) {
        config.properties = { ...ap.properties(), ...config.properties }
      }
    })
    return config
  }

    // Autopilot API - register with Autopilot API
  const registerProvider = ()=> {
    app.debug('**** intialise Sk path subscriptions *****')
    subscribeToPaths()

    app.debug('**** register AP Provider *****')
    try {
      app.registerAutopilotProvider(
        {
          getData: async (deviceId) => {
            return apData
          },
          getState: async (deviceId) => {
            return apData.state
          },
          setState: async (
            state,
            deviceId
          ) => {
            if (isValidState(state)) {
              return autopilot.putStatePromise(undefined, undefined, state, undefined)
            } else {
              throw new Error(`${state} is not a valid value!`)
            }
          },
          getMode: async (deviceId) => {
            throw new Error('Not implemented!')
          },
          setMode: async (mode, deviceId) => {
            throw new Error('Not implemented!')
          },
          getTarget: async (deviceId) => {
            return apData.target
          },
          setTarget: async (value, deviceId) => {
            if ( apData.state === 'auto' ) {
              return autopilot.putTargetHeadingPromise(undefined, undefined, radiansToDegrees(value), undefined)
            } else if ( apData.state === 'wind' ) {
              return autopilot.putTargetWindPromise(undefined, undefined, radiansToDegrees(value), undefined)
            } else {
              throw new Error(`Unable to set target value! STATE = ${apData.state}`)
            } 
          },
          adjustTarget: async (
            value,
            deviceId
          ) => {
            return autopilot.putAdjustHeadingPromise(undefined, undefined, Math.floor(radiansToDegrees(value)), undefined)
          },
          engage: async (deviceId) => {
            return autopilot.putStatePromise(undefined, undefined, defaultEngagedState, undefined)
          },
          disengage: async (deviceId) => {
            return autopilot.putStatePromise(undefined, undefined, 'standby', undefined)           
          },
          tack: async (
            direction,
            deviceId
          ) => {
            return autopilot.putTackPromise(undefined, undefined, direction, undefined)
          },
          gybe: async (
            direction,
            deviceId
          ) => {
            throw new Error('Not implemented!')
          },
          dodge: async (
            direction,
            deviceId
          ) => {
            throw new Error('Not implemented!')
          }
        },
        [apType]
      )
    } catch (error) {
      app.debug(error)
    }
  }

  // Subscribe to autopilot paths
  const subscribeToPaths = () => {
    app.subscriptionmanager?.subscribe(
        {
          context: 'vessels.self',
          subscribe: [
            {
              path: 'steering.autopilot.*',
              period: 500
            }
          ]
        },
        onStop,
        (err) => {
          console.log(`Autopilot subscriptions failed! ${err}`)
        },
        (msg) => {
          processAPDeltas(msg)
        }
      )
  }

  /** Process deltas for steering.autopilot data
   * Note: Only deltas where source.type = NMEA2000 and source.src = autopilot.id are processed!
   */
  const processAPDeltas = async (delta) => {
    if (!Array.isArray(delta.updates)) {
      return
    }
    delta.updates.forEach((update) => {
      if (Array.isArray(update.values)) {
        update.values.forEach((pathValue) => {
          if (
            update.source &&
            update.source.type &&
            update.source.type === 'NMEA2000'
          ) {
            // match the src value to the autopilot.id
            if (String(update.source.src) !== autopilot.id) {
              return
            }
            // map n2k device state to API.state & API.mode
            if (pathValue.path === 'steering.autopilot.state') {             
              apData.state = isValidState(pathValue.value) ? pathValue.value : null
              apData.engaged = apData.options.states.find(i => i.name === pathValue.value).engaged
              app.autopilotUpdate(apType, {
                state: apData.state,
                engaged: apData.engaged
              })
            }

            // map n2k device target value to API.target
            if (
              pathValue.path === 'steering.autopilot.target.windAngleApparent' &&
              apData.state === 'wind'
            ) {
              apData.target = pathValue.value
              app.autopilotUpdate(apType, {target: pathValue.value})
            }
            
            if (
              (pathValue.path === 'steering.autopilot.target.headingTrue' ||
              pathValue.path === 'steering.autopilot.target.headingMagnetic') &&
              apData.state !== 'wind'
            ) {
              apData.target = pathValue.value
              app.autopilotUpdate(apType, {target: pathValue.value})
            }
          }
        })
      }
    })
  }

  const radiansToDegrees = (value) => value * 180 / Math.PI
  
  const degreesToRadians = (value) => value * (Math.PI/180.0)


  return plugin
}
