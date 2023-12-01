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

const _ = require('lodash')

const target_heading_path = "steering.autopilot.target.headingMagnetic"
const target_wind_path = "steering.autopilot.target.windAngleApparent"
const state_path = "steering.autopilot.state"
const adjust_heading = "steering.autopilot.actions.adjustHeading"
const tack = "steering.autopilot.actions.tack"
const advance = "steering.autopilot.actions.advanceWaypoint"

const types  = {
  raymarineST: require('./raymarinest'),
  raySTNGConv: require('./raystngconv'),
  raymarineN2K: require('./raymarinen2k')
}

module.exports = function(app) {
  var plugin = {}
  var onStop = []
  var autopilot
  var pilots = {}

  _.keys(types).forEach( type => {
    const module = types[type]
    //console.log(`${type}: ${module}`)
    if ( module ) {
      if ( typeof module !== 'function' ) {
        app.error(`bad ap impl ${module} ${typeof module}`)
      } else {
        pilots[type] = module(app)
      }
    }
  })

  plugin.start = function(props) {

    autopilot = pilots[props.type]
    autopilot.start(props)

    app.registerPutHandler('vessels.self',
                           state_path,
                           autopilot.putState)

    app.registerPutHandler('vessels.self',
                           target_heading_path,
                           autopilot.putTargetHeading)

    app.registerPutHandler('vessels.self',
                           target_wind_path,
                           autopilot.putTargetWind)

    app.registerPutHandler('vessels.self',
                           adjust_heading,
                           autopilot.putAdjustHeading)

    app.registerPutHandler('vessels.self',
                           tack,
                           autopilot.putTack)

    app.registerPutHandler('vessels.self',
                           advance,
                           autopilot.putAdvanceWaypoint)

    registerProvider(props.type)
  }

  plugin.stop = function() {
    onStop.forEach(f => f());
    onStop = []
    if ( autopilot ) {
      autopilot.stop()
    }
  }

  plugin.id = "autopilot"
  plugin.name = "Autopilot Control"
  plugin.description = "Plugin that controls an autopilot"

  plugin.schema = function() {
    let config = {
      title: "Autopilot Control",
      type: "object",
      properties: {
        type: {
          type: 'string',
          title: 'Autopilot Type',
          enum: [
            'raymarineN2K',
            'raySTNGConv',
            'raymarineST'
          ],
          enumNames: [
            'Raymarine NMEA2000',
            'Raymarine SmartPilot -> SeaTalk-STNG-Converter',
            'Raymarine Seatalk 1 AP'
          ],
          default: 'raymarineN2K'
        }
      }
    }

    _.values(pilots).forEach(ap => {
      if ( ap && ap.properties ) {
        config.properties  = { ...ap.properties(), ...config.properties }
      }
    })
    return config
  }

  // register with Autopilot API
  const registerProvider = (apType)=> {
    app.debug('**** registerProvider *****')
    try {
      app.registerAutopilotProvider(
        {
          getData: async (deviceId) => {
            const apState = app.getSelfPath(state_path)
            return {
              options: {
                states: [
                  {name: 'auto', engaged: true},
                  {name: 'wind', engaged: true},
                  {name: 'route', engaged: true},
                  {name: 'standby', engaged: false}
                ],
                modes: []
              },
              mode: null,
              state: apState ?? null,
              engaged: ['auto','wind','route'].includes(apState) ? true : false
            }
          },
          getState: async (deviceId) => {
            return app.getSelfPath(state_path) ?? null
          },
          setState: async (
            state,
            deviceId
          ) => {
            const r = autopilot.putState(undefined, undefined, state, undefined)
            if (r.state === 'FAILURE') {
              throw new Error(r.message)
            }
            else {
              return state === 'standby' ? false : true
            }
          },
          getMode: async (deviceId) => {
            throw new Error('Not implemented!')
          },
          setMode: async (mode, deviceId) => {
            throw new Error('Not implemented!')
          },
          getTarget: async (deviceId) => {
            throw new Error('Not implemented!')
          },
          setTarget: async (value, deviceId) => {
            const apState = app.getSelfPath(state_path)
            const deg = value * (180 / Math.PI)
            if ( apState === 'auto' ) {
              const r = autopilot.putTargetHeading(undefined, undefined, deg, undefined)
              if (r.state === 'FAILURE') {
                throw new Error(r.message)
              }
            } else if ( apState === 'wind' ) {
              const r = autopilot.putTargetWind(undefined, undefined, deg, undefined)
              if (r.state === 'FAILURE') {
                throw new Error(r.message)
              }
            }
            return
          },
          adjustTarget: async (
            value,
            deviceId
          ) => {
            const deg = value * (180 / Math.PI)
            const r = autopilot.putAdjustHeading(undefined, undefined, deg, undefined)
            if (r.state === 'FAILURE') {
              throw new Error(r.message)
            }
            return
          },
          engage: async (deviceId) => {
            const r = autopilot.putState(undefined, undefined, 'auto', undefined)
            if (r.state === 'FAILURE') {
              throw new Error(r.message) 
            }
            return
          },
          disengage: async (deviceId) => {
            const r = autopilot.putState(undefined, undefined, 'standby', undefined)
            if (r.state === 'FAILURE') {
              throw new Error(r.message)
            }
            return
          },
          tack: async (
            direction,
            deviceId
          ) => {
            const r = autopilot.putTack(undefined, undefined, 'direction', undefined)
            if (r.state === 'FAILURE') { throw new Error(r.message) }
            return
          },
          gybe: async (
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

  return plugin;
}
