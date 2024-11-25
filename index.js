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

const apData = {
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
  state: null,
  engaged: false,
  target: null
}

module.exports = function(app) {
  var plugin = {}
  var onStop = []
  var autopilot
  var pilots = {}


  let apType = '' // autopilot type

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
    apType= props.type
    autopilot = pilots[props.type]
    autopilot.start(props)
    app.debug('autopilot.id:', autopilot.id, 'autopilot.type:', apType)

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

    registerProvider()
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

  // Autopilot API - register with Autopilot API
  const registerProvider = ()=> {
    app.debug('**** intialise n2k listener *****')
    app.on('N2KAnalyzerOut', onStreamEvent)

    app.debug('**** registerProvider *****')
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
            const r = autopilot.putState(undefined, undefined, state, undefined)
            if (r.state === 'FAILURE') {
              throw new Error(r.message)
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
            const apState = apData.state
            if ( apState === 'auto' ) {
              const r = autopilot.putTargetHeading(undefined, undefined, value, undefined)
              if (r.state === 'FAILURE') {
                throw new Error(r.message)
              }
            } else if ( apState === 'wind' ) {
              const r = autopilot.putTargetWind(undefined, undefined, value, undefined)
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
            const r = autopilot.putAdjustHeading(undefined, undefined, value, undefined)
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

  // Autopilot API - parse NMEA2000 stream input
  const onStreamEvent = (evt) => {
    // in-scope PGNs
    const pgns = [
      65345, 65360, 65379, 
      65288,
      127237,
      126720
    ]
   
    if (!pgns.includes(evt.pgn) || String(evt.src) !== autopilot.id) {
      return
    }
   
    // 127237 `Heading / Track control (Rudder, etc.)`
    if (evt.pgn === 127237) { 
      //app.debug('n2k pgn=', evt.pgn, evt.fields, evt.description)
    }

    // 65288 = notifications.autopilot.<alarmName>
    if (evt.pgn === 65288) {
      if (evt.fields['Manufacturer Code'] !== 'Raymarine'
        || typeof evt.fields['Alarm Group'] === 'Autopilot'
        || typeof evt.fields['Alarm Status'] === 'undefined') {
        return
      }
 
      const method = [ 'visual' ]

      let state = evt.fields['Alarm Status']
      if ( state === 'Alarm condition met and not silenced' ) {
        method.push('sound')
      }

      if ( state === 'Alarm condition not met' ) {
        state = 'normal'
      } else {
        state = 'alarm'
      }

      let alarmId = evt.fields['Alarm ID']

      if ( typeof alarmId !== 'string' ) {
        alarmId = `Unknown Seatalk Alarm ${alarmId}`
      } else if ( 
        state === 'alarm' &&
          ['WP Arrival','Pilot Way Point Advance','Pilot Route Complete'].includes(alarmId)
        ) {
        state = 'alert'
      }

      // normalise alarm name
      let alarmName = normaliseAlarmId(alarmId)
      if (!alarmName) {
        app.debug(`*** Normalise Alarm Failed: ${alarmId}`)
        return
      }

      const msg = {
        message: alarmName,
        method: method,
        state: state
      }

      app.autopilotUpdate(apType, {
        alarm: {
          path: alarmName, 
          value: msg
        }
      })
    }

    // 65345 = 'steering.autopilot.target (windAngleApparent)'
    if (evt.pgn === 65345) {
      let angle = evt.fields['Wind Datum'] ? Number(evt.fields['Wind Datum']) : null
      angle = ( typeof angle === 'number' && angle > Math.PI ) ? angle-(Math.PI*2) : angle
      apData.target = radiansToDegrees(angle)
      app.autopilotUpdate(apType, {target: angle})
    }

    // 65360 = 'steering.autopilot.target (true/magnetic)'
    if (evt.pgn === 65360) {
      const targetTrue = evt.fields['Target Heading True'] ? Number(evt.fields['Target Heading True']) : null
      const targetMagnetic = evt.fields['Target Heading Magnetic'] ? Number(evt.fields['Target Heading Magnetic']) : null
      const target = typeof targetTrue === 'number' ? targetTrue :
        typeof targetMagnetic === 'number' ? targetMagnetic: null
      apData.target = radiansToDegrees(target)
      app.autopilotUpdate(apType, {target: target})
    }

    // 126720 ``
    if (evt.pgn === 126720) { 
      //app.debug('n2k pgn=', evt.pgn, evt.fields, evt.description)
    }
    
    // 65379 = 'steering.autopilot.state', 'steering.autopilot.engaged'
    if (evt.pgn === 65379) {
      //app.debug('n2k pgn=', evt.pgn, evt.fields, evt.description)
      const mode = typeof evt.fields['Pilot Mode Data']  === 'number' ? evt.fields['Pilot Mode Data'] : null
      const subMode = typeof evt.fields['Sub Mode']  === 'number' ? evt.fields['Sub Mode'] : null
      //app.debug(`mode: ${mode}, subMode: ${subMode}`)
      if ( mode === 0 && subMode === 0 ) {
        apData.state = 'standby'
        apData.engaged = false
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: false
        })
      }
      else if ( mode == 0 && subMode == 1 ) {
        apData.state = 'wind'
        apData.engaged = true
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: true
        })
      }
      else if ( (mode == 128 || mode == 129) && subMode == 1 ) {
        apData.state = 'route'
        apData.engaged = true
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: true
        })
      }
      else if ( mode == 2 && subMode == 0 ) {
        apData.state = 'route'
        apData.engaged = true
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: true
        })
      }
      else if ( mode == 64 && subMode == 0 ) {
        apData.state = 'auto'
        apData.engaged = true
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: true
        })
      }
      else {
        apData.state = 'standby'
        apData.engaged = false
        app.autopilotUpdate(apType, {
          state: apData.state,
          engaged: false
        })
      }
    }

  }

  // normalise SK alarm path 
  const normaliseAlarmId = (id) => {
    switch (id) {
      case 'WP Arrival':
        return 'waypointArrival'
      case 'Pilot Way Point Advance':
        return 'waypointAdvance'
      case 'Pilot Route Complete':
        return 'routeComplete'
      default:
        return 'unknown'
    }
  }

  const radiansToDegrees = (value) => value * 180 / Math.PI
  
  const degreesToRadians = (value) => value * (Math.PI/180.0)


  return plugin;
}
