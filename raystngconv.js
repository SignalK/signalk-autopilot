
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

const util = require('util')
const _ = require('lodash')

const state_path = "steering.autopilot.state.value"

const SUCCESS_RES = { state: 'SUCCESS' }
const FAILURE_RES = { state: 'FAILURE' }

const state_commands = {
  "auto":    "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,01,fe,00,00,00,00,00,00,ff,ff,ff,ff,ff",
  "wind":    "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff",
  "route":   "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,03,fc,3c,42,00,00,00,00,ff,ff,ff,ff,ff",
  "standby": "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,02,fd,00,00,00,00,00,00,ff,ff,ff,ff,ff"
}

const keys_code = {
  "+1":      "07,f8",
  "+10":     "08,f7",
  "-1":      "05,fa",
  "-10":     "06,f9",
  "-1-10":   "21,de",
  "+1+10":   "22,dd"
}

const key_command = "%s,7,126720,%s,%s,16,3b,9f,f0,81,86,21,%s,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff"
const heading_command = "%s,3,126208,%s,%s,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,%s,%s"
const wind_direction_command = "%s,3,126720,%s,%s,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff"
const raymarine_ttw_Mode = "%s,3,126208,%s,%s,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,81,01,05,ff,ff"
const raymarine_ttw = "%s,3,126208,%s,%s,21,00,00,ef,01,ff,ff,ff,ff,ff,ff,04,01,3b,07,03,04,04,6c,05,1a,50"

// New alarm function
const raymarine_silence =  "%s,7,65288,%s,255,8,3b,9f,%s,%s,00,00,00,00"

const keep_alive = "%s,7,65384,%s,255,8,3b,9f,00,00,00,00,00,00"
const keep_alive2 = "%s,7,126720,%s,255,7,3b,9f,f0,81,90,00,03"

const default_src = '1'
const autopilot_dst = '115' // default converter device id
const everyone_dst = '255'

module.exports = function(app) {
  var deviceid
  var pilot = {id: null}
  var discovered

  pilot.start = (props) => {
    deviceid = props.converterDeviceId
    pilot.id = deviceid
    app.debug('props.converterDeviceId:', deviceid)
  }

  pilot.stop = () => {
  }

  function sendN2k(msgs) {
    app.debug("n2k_msg: " + msgs)
    msgs.map(function(msg) { app.emit('nmea2000out', msg)})
  }

  pilot.putTargetHeading = (context, path, value, cb) => {
    var state = app.getSelfPath(state_path)

    if ( state !== 'auto' ) {
      return { message: 'Autopilot not in auto mode', ...FAILURE_RES }

    } else {
      var new_value = Math.trunc(degsToRad(value) * 10000)
      var msg = util.format(heading_command, (new Date()).toISOString(), default_src,
                            autopilot_dst, padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))

      sendN2k([msg])
      return SUCCESS_RES
    }
  }

  pilot.putState = (context, path, value, cb) => {
    if ( !state_commands[value] ) {
      return { message: `Invalid state: ${value}`, ...FAILURE_RES }
    } else {
      var msg = util.format(state_commands[value], (new Date()).toISOString(), default_src, deviceid)
      sendN2k([msg])
      return SUCCESS_RES
    }
  }

  pilot.putTargetWind = (context, path, value, cb)  => {
    var state = app.getSelfPath(state_path)

    if ( state !== 'wind' ) {
      return { message: 'Autopilot not in wind vane mode', ...FAILURE_RES }
    } else {
      var new_value = Math.trunc(value * 10000)
      var msg = util.format(wind_direction_command, (new Date()).toISOString(), default_src,
                            autopilot_dst, padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))
      
      sendN2k([msg])
      return SUCCESS_RES
    }
  }

  pilot.putAdjustHeading = (context, path, value, cb)  => {
    var state = app.getSelfPath(state_path)

    if ( state !== 'auto' && state !== 'wind' ) {
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
      sendN2k(changeHeadingByKey(app, deviceid, {value: aString}))
      return SUCCESS_RES
    }
  }

  pilot.putTack = (context, path, value, cb)  => {
    var state = app.getSelfPath(state_path)
    
    if ( state !== 'wind' ) {
      return { message: 'Autopilot not in wind vane mode', ...FAILURE_RES }
    } else {
      sendN2k(tackTo(app, deviceid, {value: value}))
      return SUCCESS_RES
    }
  }

  pilot.putAdvanceWaypoint = (context, path, value, cb)  => {
    var state = app.getSelfPath(state_path)
    
    if ( state !== 'route' ) {
      return { message: 'Autopilot not in track mode', ...FAILURE_RES }
    } else {
      sendN2k(advanceWaypoint(app, deviceid))
      return SUCCESS_RES
    }
  }

  pilot.sendCommand = (req, res) => {
    if ( typeof deviceid != "undefined" )
    {
      sendCommand(app, deviceid, req.body)
      res.send("Executed command")
    }
  }

  pilot.properties = () => {
    let defaultConverterId = deviceid ?? '115'
    let description = 'No SeaTalk-STNG-Converter device found'

    app.debug('***pre-discovery -> defaultConverterId', defaultConverterId)
      
    if ( !discovered ) {
      const sources = app.getPath('/sources')
      if ( sources ) {
        _.values(sources).forEach(v => {
          if ( typeof v === 'object' ) {
            _.keys(v).forEach(id => {
              if ( v[id] && v[id].n2k && v[id].n2k.hardwareVersion && v[id].n2k.hardwareVersion.startsWith('SeaTalk-STNG-Converter') ) {
                discovered = id
              }
            })
          }
        })
      }
    }

    if ( discovered ) {
      defaultConverterId = discovered
      description = `SeaTalk-STNG-Converter with id ${discovered} discovered`
      app.debug(description)
    }

    pilot.id = defaultConverterId
    app.debug('*** post-discovery -> defaultConverterId', defaultConverterId)

    return {
      converterDeviceId: {
        type: "string",
        title: "Raymarine SeaTalk-STNG-Converter NMEA2000 ID",
        description,
        default: defaultConverterId
      }
    }
  }

  return pilot
}

function padd(n, p, c)
{
  var pad_char = typeof c !== 'undefined' ? c : '0';
  var pad = new Array(1 + p).join(pad_char);
  return (pad + n).slice(-pad.length);
}

function changeHeading(app, deviceid, command_json)
{
  var ammount = command_json["value"]
  var state = app.getSelfPath(state_path)
  var new_value
  var command_format
  var n2k_msgs
  
  app.debug("changeHeading: " + state + " " + ammount)
  if ( state == "auto" )
  {
    var current = app.getSelfPath(target_heading_path)
    new_value = radsToDeg(current) + ammount

    if ( new_value < 0 ) {
      new_value = 360 + new_value
    } else if ( new_value > 360 ) {
      new_value = new_value - 360
    }
    
    app.debug(`current heading: ${radsToDeg(current)} new value: ${new_value}`)

    command_format = heading_command
  }
  else if ( state == "wind" )
  {
    var current = app.getSelfPath(target_wind_path)
    new_value = radsToDeg(current) + ammount
    
    if ( new_value < 0 )
      new_value = 360 + new_value
    else if ( new_value > 360 )
      new_value = new_value - 360

    app.debug(`current wind angle: ${radsToDeg(current)} new value: ${new_value}`)
    command_format = wind_direction_command
  }
  else
  {
    //error
  }

  if ( new_value )
  {
    new_value = Math.trunc(degsToRad(new_value) * 10000)
    n2k_msgs = [util.format(command_format, (new Date()).toISOString(), default_src,
                            autopilot_dst, padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))]
  }
  return n2k_msgs
}

function setState(app, deviceid, command_json)
{
  var state = command_json["value"]
  app.debug("setState: " + state)
  return [util.format(state_commands[state], (new Date()).toISOString(), default_src, deviceid)]
}

function tackTo(app, deviceid, command_json)
{
  var tackTo = command_json["value"]
  app.debug("tackTo: " + tackTo)
  if (tackTo === "port")
  {
    return [util.format(key_command, (new Date()).toISOString(), default_src, everyone_dst, keys_code["-1-10"])]
  }
  else if (tackTo === "starboard")
  {
    return [util.format(key_command, (new Date()).toISOString(), default_src, everyone_dst, keys_code["+1+10"])]
  }
  else
  {
    app.debug("tackTo: unknown " + tackTo)
  }
}

function changeHeadingByKey(app, deviceid, command_json)
{
  var key = command_json["value"]
  app.debug("changeHeadingByKey: " + key)
  return [util.format(key_command, (new Date()).toISOString(), default_src, everyone_dst, keys_code[key])]
}

function advanceWaypoint(app, deviceid, command_json)
{
  return [util.format(raymarine_ttw_Mode, (new Date()).toISOString(),
                      default_src, deviceid),
          util.format(raymarine_ttw, (new Date()).toISOString(),
                      default_src, deviceid)]
}

function radsToDeg(radians) {
  return radians * 180 / Math.PI
}

function degsToRad(degrees) {
  return degrees * (Math.PI/180.0);
}

