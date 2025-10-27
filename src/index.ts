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

import {
  ActionResult,
  AutopilotProvider,
  AutopilotInfo
} from '@signalk/server-api'
import raymarinen2k from './raymarinen2k'
import raystngconv from './raystngconv'
import raymarinest from './raymarinest'
import simrad from './simrad'

const target_heading = 'steering.autopilot.target.headingMagnetic'
const target_wind = 'steering.autopilot.target.windAngleApparent'
const state_path = 'steering.autopilot.state'
const adjust_heading = 'steering.autopilot.actions.adjustHeading'
const tack = 'steering.autopilot.actions.tack'
const advance = 'steering.autopilot.actions.advanceWaypoint'

export const types: { [key: string]: (app: any) => Autopilot } = {
  raymarineN2K: raymarinen2k,
  raymarineST: raymarinest as (app: any) => Autopilot,
  raySTNGConv: raystngconv as (app: any) => Autopilot,
  simrad: simrad as (app: any) => Autopilot
}

const apData: AutopilotInfo = {
  options: {
   states: [
      { name: 'standby', engaged: false },
      { name: 'auto', engaged: true },
      { name: 'wind', engaged: true },
      { name: 'route', engaged: true }
    ],
    modes: [],
    actions: []
  },
  mode: null,
  state: null,
  engaged: false,
  target: null
}

const defaultEngagedMode = 'auto'
const isValidState = (value: string) => {
  return apData.options.states.findIndex((i) => i.name === value) !== -1
}

export interface Autopilot {
  id: number
  start(props: any): void
  stop(): void
  states?(): { name: string; engaged: boolean }[]
  modes?(): string[]
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
  putAutoTurn?(
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
  let apType = '' // autopilot type

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
    apType = props.type
    autopilot = pilots[props.type]
    autopilot.start(props)

    if (autopilot.states) {
      apData.options.states = autopilot.states()
    }
    if (autopilot.modes) {
      apData.options.modes = autopilot.modes()
    }

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

    /*
    const possibleValues = apData.options.states.map((s) => {
      return { title: s.name, value: s.name }
    })

    
    app.handleMessage(plugin.id, {
      updates: [
        {
          //values: [{ path: state_path, value: 'standby' }],
          meta: [
            {
              path: state_path,
              value: {
                displayName: 'Autopilot State',
                type: 'multiple',
                possibleValues
              }
            }
          ]
        }
      ]
    })
      */

    if ( props.enableV2API ) {
      registerProvider()
    }
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
          enum: ['raymarineN2K', 'raySTNGConv', 'raymarineST', 'simrad'],
          enumNames: [
            'Raymarine NMEA2000',
            'Raymarine SmartPilot -> SeaTalk-STNG-Converter',
            'Raymarine Seatalk 1 AP',
            'Simrad NMEA2000'
          ],
          default: 'raymarineN2K'
        },
        enableV2API: {
          type: 'boolean',
          title: 'Enable Autopilot V2 API',
          description:
            'Enables the Signal K Autopilot V2 API',
          default: true
        }
      }
    }

    Object.values(pilots).forEach((ap) => {
      if (ap && ap.properties) {
        config.properties = { ...config.properties, ...ap.properties() }
      }
    })
    return config
  }

  // Autopilot API - register with Autopilot API
  const registerProvider = () => {
    app.debug('**** intialise Sk path subscriptions *****')
    subscribeToPaths()

    app.debug('**** register AP Provider *****')
    try {
      const provider: AutopilotProvider = {
        getData: async (_deviceId): Promise<AutopilotInfo> => {
          return apData
        },
        getState: async (_deviceId: string) => {
          return apData.state as string
        },
        setState: async (state, _deviceId) => {
          if (isValidState(state)) {
            return autopilot.putStatePromise(state)
          } else {
            throw new Error(`${state} is not a valid value!`)
          }
        },
        getMode: async (_deviceId) => {
          throw new Error('Not implemented!')
        },
        setMode: async (_mode, _deviceId) => {
          throw new Error('Not implemented!')
        },
        getTarget: async (_deviceId) => {
          return apData.target as number
        },
        setTarget: async (value, _deviceId) => {
          if (apData.mode === 'auto') {
            return autopilot.putTargetHeadingPromise(radiansToDegrees(value))
          } else if (apData.mode === 'wind') {
            return autopilot.putTargetWindPromise(radiansToDegrees(value))
          } else {
            throw new Error(`Unable to set target value! MODE = ${apData.mode}`)
          }
        },
        adjustTarget: async (value, _deviceId) => {
          return autopilot.putAdjustHeadingPromise(
            Math.floor(radiansToDegrees(value))
          )
        },
        engage: async (_deviceId) => {
          return autopilot.putStatePromise(defaultEngagedMode)
        },
        disengage: async (_deviceId) => {
          return autopilot.putStatePromise('standby')
        },
        tack: async (direction, _deviceId) => {
          return autopilot.putTackPromise(direction)
        },
        gybe: async (_direction, _deviceId) => {
          throw new Error('Not implemented!')
        },
        dodge: async (_direction, _deviceId) => {
          throw new Error('Not implemented!')
        },
        courseCurrentPoint: async (_deviceId: string): Promise<void> => {
          throw new Error('Not implemented!')
        },
        courseNextPoint: async (_deviceId: string): Promise<void> => {
          throw new Error('Not implemented!')
        }
      }
      app.registerAutopilotProvider(provider, [apType])
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
      (err: any) => {
        console.log(`Autopilot subscriptions failed! ${err}`)
      },
      (msg: any) => {
        processAPDeltas(msg)
      }
    )
  }

  /** Process deltas for steering.autopilot data
   * Note: Only deltas where source.type = NMEA2000 and source.src = autopilot.id are processed!
   */
  
  const processAPDeltas = async (delta: any) => {
    if (!Array.isArray(delta.updates)) {
      return
    }
    delta.updates.forEach((update: any) => {
      if (Array.isArray(update.values)) {
        update.values.forEach((pathValue: any) => {
          if (
            update.source &&
            update.source.type &&
            update.source.type === 'NMEA2000'
          ) {
            // match the src value to the autopilot.id
            if (Number(update.source.src) !== autopilot.id) {
              return
            }

             // map n2k device state to API.state & API.mode
            if (pathValue.path === 'steering.autopilot.state') {
              apData.state = isValidState(pathValue.value)
                ? pathValue.value
                : null
              const stateObj = apData.options.states.find(
                (i) => i.name === pathValue.value
              )
              apData.engaged = stateObj ? stateObj.engaged : false
              app.autopilotUpdate(apType, {
                state: apData.state,
                engaged: apData.engaged
              })
            }

            // map n2k device target value to API.target
            if (
              pathValue.path ===
                'steering.autopilot.target.windAngleApparent' &&
              apData.state === 'wind'
            ) {
              apData.target = pathValue.value
              app.autopilotUpdate(apType, { target: pathValue.value })
            }

            if (
              (pathValue.path === 'steering.autopilot.target.headingTrue' ||
                pathValue.path ===
                  'steering.autopilot.target.headingMagnetic') &&
              apData.state !== 'wind'
            ) {
              apData.target = pathValue.value
              app.autopilotUpdate(apType, { target: pathValue.value })
            }
          }
        })
      }
    })
  }

  const radiansToDegrees = (value: number) => (value * 180) / Math.PI

  //const degreesToRadians = (value: number) => value * (Math.PI / 180.0)

  return plugin
}
