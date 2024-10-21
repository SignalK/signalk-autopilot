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
                      value: 'wind',
                    },
                    {
                      title: 'Route',
                      value: 'route'
                    }
                  ]
                }
              },
            ]
          }
      ]
    })
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

  return plugin;
}
