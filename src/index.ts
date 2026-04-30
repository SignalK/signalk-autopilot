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
  AutopilotInfo,
  AutopilotActionDef
} from '@signalk/server-api'
import raymarinen2k from './raymarinen2k'
import raystngconv from './raystngconv'
import raymarinest from './raymarinest'
import simrad from './simrad'
import emulator from './emulator'

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
  simrad: simrad as (app: any) => Autopilot,
  emulator: emulator as (app: any) => Autopilot
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

// Default target-type table used when the AP backend doesn't override
// targetTypeForState(). Maps a state name to the kind of target value that
// state expects: 'heading' (heading-target states), 'wind' (wind-vane states),
// 'route' (route/track follows the active waypoint and has no settable target).
type TargetType = 'heading' | 'wind' | 'route' | null
const DEFAULT_TARGET_TYPES: { [k: string]: TargetType } = {
  auto: 'heading',
  wind: 'wind',
  route: 'route'
}
const DEFAULT_ROUTE_STATE = 'route'
const DEFAULT_DODGE_FALLBACK_STATE = 'auto'

const isValidState = (value: string) => {
  return apData.options.states.findIndex((i) => i.name === value) !== -1
}

const buildDefaultActions = (
  state: string | null,
  isDodging: boolean,
  routeState: string,
  engagedStates: string[]
): AutopilotActionDef[] => {
  // Default Raymarine-shaped action availability. Backends with different
  // vocabularies should override Autopilot.actionsForState().
  const tackable = state === 'wind' || state === 'auto'
  return [
    { id: 'tack', name: 'Tack', available: tackable },
    { id: 'gybe', name: 'Gybe', available: tackable },
    { id: 'courseNextPoint', name: 'Advance Waypoint', available: state === routeState },
    { id: 'courseCurrentPoint', name: 'Steer to Waypoint', available: state !== null && state !== routeState && engagedStates.includes(state) },
    { id: 'dodge', name: 'Dodge', available: state !== null && engagedStates.includes(state) && !isDodging }
  ]
}

export interface Autopilot {
  id: number
  start(props: any): void
  stop(): void
  states?(): { name: string; engaged: boolean }[]
  modes?(): string[]

  // Capability hooks — let backends declare what their state names mean,
  // instead of index.ts guessing from Raymarine-shaped string literals.
  defaultEngagedState?(): string
  targetTypeForState?(state: string): TargetType
  actionsForState?(state: string | null, isDodging: boolean): AutopilotActionDef[]
  routeState?(): string
  // State to switch to during dodge (e.g. route -> auto), or null to stay put.
  dodgeFallbackState?(state: string): string | null
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
  let lastState: string | undefined = undefined
  let dodgeActive = false
  let preDodgeState: string | null = null
  let preDodgeTarget: number | null = null

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

    if (props.enableV2API === true || props.enableV2API === undefined) {
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
          enum: [
            'raymarineN2K',
            'raySTNGConv',
            'raymarineST',
            'simrad',
            'emulator'
          ],
          enumNames: [
            'Raymarine NMEA2000',
            'Raymarine SmartPilot -> SeaTalk-STNG-Converter',
            'Raymarine Seatalk 1 AP',
            'Simrad NMEA2000',
            'Emulator'
          ],
          default: 'raymarineN2K'
        },
        enableV2API: {
          type: 'boolean',
          title: 'Enable Autopilot V2 API',
          description: 'Enables the Signal K Autopilot V2 API',
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

  // Resolvers — ask the AP backend, fall back to a Raymarine-shaped default.
  // Keeps state-name knowledge inside the backend that owns it.
  const apTargetType = (state: string | null): TargetType => {
    if (!state) return null
    if (autopilot?.targetTypeForState) return autopilot.targetTypeForState(state)
    return DEFAULT_TARGET_TYPES[state] ?? null
  }
  const apRouteState = (): string =>
    autopilot?.routeState?.() ?? DEFAULT_ROUTE_STATE
  const apDefaultEngagedState = (): string => {
    if (autopilot?.defaultEngagedState) return autopilot.defaultEngagedState()
    const firstEngaged = apData.options.states.find((s) => s.engaged)
    return firstEngaged?.name ?? 'auto'
  }
  const apActionsForState = (
    state: string | null,
    isDodging: boolean
  ): AutopilotActionDef[] => {
    if (autopilot?.actionsForState)
      return autopilot.actionsForState(state, isDodging)
    const engagedStates = apData.options.states
      .filter((s) => s.engaged)
      .map((s) => s.name)
    return buildDefaultActions(state, isDodging, apRouteState(), engagedStates)
  }
  const apDodgeFallbackState = (state: string): string | null => {
    if (autopilot?.dodgeFallbackState) return autopilot.dodgeFallbackState(state)
    // Default: route mode can't dodge directly — switch to auto first.
    return state === apRouteState() ? DEFAULT_DODGE_FALLBACK_STATE : null
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
          return apData.mode
        },
        setMode: async (mode, _deviceId) => {
          // Raymarine/Simrad conflate mode and state
          if (isValidState(mode)) {
            return autopilot.putStatePromise(mode)
          } else {
            throw new Error(`${mode} is not a valid mode value!`)
          }
        },
        getTarget: async (_deviceId) => {
          return apData.target as number
        },
        setTarget: async (value, _deviceId) => {
          const mode = apData.mode ?? apData.state
          const targetType = apTargetType(mode)
          if (targetType === 'heading') {
            return autopilot.putTargetHeadingPromise(radiansToDegrees(value))
          } else if (targetType === 'wind') {
            return autopilot.putTargetWindPromise(radiansToDegrees(value))
          } else {
            throw new Error(`Unable to set target value! state = ${mode}`)
          }
        },
        adjustTarget: async (value, _deviceId) => {
          return autopilot.putAdjustHeadingPromise(
            Math.floor(radiansToDegrees(value))
          )
        },
        engage: async (_deviceId) => {
          const engageState = lastState || apDefaultEngagedState()
          apData.state = engageState
          apData.mode = engageState
          return autopilot.putStatePromise(engageState)
        },
        disengage: async (_deviceId) => {
          return autopilot.putStatePromise('standby')
        },
        tack: async (direction, _deviceId) => {
          return autopilot.putTackPromise(direction)
        },
        gybe: async (direction, _deviceId) => {
          // Raymarine uses the same keystroke for tack and gybe —
          // the pilot decides based on wind angle
          return autopilot.putTackPromise(direction)
        },
        dodge: async (value, _deviceId) => {
          if (value === null) {
            // Cancel dodge — restore original state and target
            if (!dodgeActive) {
              throw new Error('Dodge mode is not active')
            }
            if (preDodgeState && preDodgeState !== apData.state) {
              await autopilot.putStatePromise(preDodgeState)
            }
            // Only restore a heading target — wind/route states manage their own.
            if (
              apTargetType(preDodgeState) === 'heading' &&
              preDodgeTarget !== null
            ) {
              await autopilot.putTargetHeadingPromise(
                radiansToDegrees(preDodgeTarget)
              )
            }
            dodgeActive = false
            preDodgeState = null
            preDodgeTarget = null
            app.autopilotUpdate(apType, {
              actions: apActionsForState(apData.state, dodgeActive)
            })
          } else if (value === 0) {
            // Enter dodge — save current state, no course change yet
            if (dodgeActive) {
              throw new Error('Dodge mode is already active')
            }
            preDodgeState = apData.state
            preDodgeTarget = apData.target
            dodgeActive = true
            const fallback = preDodgeState
              ? apDodgeFallbackState(preDodgeState)
              : null
            if (fallback) {
              await autopilot.putStatePromise(fallback)
            }
            app.autopilotUpdate(apType, {
              actions: apActionsForState(apData.state, dodgeActive)
            })
          } else {
            // Adjust dodge heading — decompose into ±10 and ±1 keystrokes
            if (!dodgeActive) {
              preDodgeState = apData.state
              preDodgeTarget = apData.target
              dodgeActive = true
              const fallback = preDodgeState
                ? apDodgeFallbackState(preDodgeState)
                : null
              if (fallback) {
                await autopilot.putStatePromise(fallback)
              }
            }
            let degrees = Math.round(radiansToDegrees(value))
            const sign = degrees > 0 ? 1 : -1
            degrees = Math.abs(degrees)
            const tens = Math.floor(degrees / 10)
            const ones = degrees % 10
            for (let i = 0; i < tens; i++) {
              await autopilot.putAdjustHeadingPromise(sign * 10)
            }
            for (let i = 0; i < ones; i++) {
              await autopilot.putAdjustHeadingPromise(sign * 1)
            }
            app.autopilotUpdate(apType, {
              actions: apActionsForState(apData.state, dodgeActive)
            })
          }
        },
        courseCurrentPoint: async (_deviceId: string): Promise<void> => {
          // Per API spec: engage the appropriate mode to steer to the active waypoint
          return autopilot.putStatePromise(apRouteState())
        },
        courseNextPoint: async (_deviceId: string): Promise<void> => {
          const state = app.getSelfPath(state_path + '.value')
          if (state !== apRouteState()) {
            throw new Error('Autopilot not in route/track mode')
          }
          const result = autopilot.putAdvanceWaypoint(
            'vessels.self', advance, 1, undefined
          )
          if (result.state !== 'COMPLETED') {
            throw new Error(result.message || 'Advance waypoint failed')
          }
          // Advance the server's course pointIndex.
          // On real hardware the chartplotter may do this via N2K,
          // but when SignalK manages the route we must do it here.
          try {
            const course = await app.courseApi.getCourse()
            if (course?.activeRoute?.href) {
              const nextIndex = (course.activeRoute.pointIndex ?? 0) + 1
              await app.courseApi.activeRoute({
                href: course.activeRoute.href,
                reverse: course.activeRoute.reverse ?? false,
                pointIndex: nextIndex,
                arrivalCircle: course.arrivalCircle ?? 100
              })
            }
          } catch (e: any) {
            app.debug('courseNextPoint: failed to advance course', e?.message ?? e)
          }
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
            update.$source === 'autopilot' ||
            (update.source &&
              update.source.type &&
              update.source.type === 'NMEA2000')
          ) {
            // match the src value to the autopilot.id
            if (
              update.$source !== 'autopilot' &&
              Number(update.source.src) !== autopilot.id
            ) {
              return
            }

            // map n2k device state to API.state & API.mode
            if (pathValue.path === 'steering.autopilot.state') {
              apData.state = isValidState(pathValue.value)
                ? pathValue.value
                : null
              apData.mode = apData.state
              const stateObj = apData.options.states.find(
                (i) => i.name === pathValue.value
              )
              apData.engaged = stateObj ? stateObj.engaged : false
              // Update available actions based on current state
              apData.options.actions = apActionsForState(
                apData.state,
                dodgeActive
              )

              app.autopilotUpdate(apType, {
                state: apData.state,
                engaged: apData.engaged,
                actions: apData.options.actions
              })
              if (apData.state != null && apData.state !== 'standby') {
                lastState = apData.state
              }
            }

            // map n2k device target value to API.target
            const currentTargetType = apTargetType(apData.state)
            if (
              pathValue.path ===
                'steering.autopilot.target.windAngleApparent' &&
              currentTargetType === 'wind'
            ) {
              apData.target = pathValue.value
              app.autopilotUpdate(apType, { target: pathValue.value })
            }

            if (
              (pathValue.path === 'steering.autopilot.target.headingTrue' ||
                pathValue.path ===
                  'steering.autopilot.target.headingMagnetic') &&
              currentTargetType !== 'wind'
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
