/*
 * Copyright 2019 Scott Bender <scott@scottbender.net> and Joachim Bakke
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

const state_path = 'steering.autopilot.state.value'

const SUCCESS_RES = { state: 'COMPLETED', statusCode: 200 }
const FAILURE_RES = { state: 'COMPLETED', statusCode: 400 }

const state_commands = {
  auto: '86,11,01,FE',
  wind: '86,11,23,DC',
  route: '86,11,03,FC',
  standby: '86,11,02,FD'
}
const keys_code = {
  '+1': '86,11,07,F8',
  '+10': '86,11,08,F7',
  '-1': '86,11,05,FA',
  '-10': '86,11,06,F9',
  '-1-10': '86,11,21,DE',
  '+1+10': '86,11,22,DD'
}

const wind_direction_command = '10,01,%s,%s'
//const heading_command = '89,%s,%s,%s,%s'
//const wp_change = '82,05,%s,%s,%s,%s,%s,%s'
const targetHeading = '89,%s,%s,%s,%s'
/*
const keep_alive = '90,00,A3' //identify as NMEA-ST bridge
const raymarine_ttw_Mode = '85,06,00,VU,4W,06,10,00,FF' //1NM, vw mag heading
const raymarine_ttw = '82,05,XX,xx,YY,yy,ZZ,zz' //wp name
*/

module.exports = function (app) {
  var outputEvent
  var pilot = {}

  pilot.start = (props) => {
    outputEvent = props.outputEvent || 'seatalkOut'
  }

  pilot.stop = () => {}

  function sendDatagram(datagram) {
    var sentence = toSentence(['$STALK', datagram])
    app.debug('datagram: ' + datagram)
    app.emit(outputEvent, sentence)

    var psentence = toSentence(['$PSMDST', datagram])
    app.emit(outputEvent, psentence)
  }

  pilot.putTargetHeadingPromise = (value) => {
    return new Promise((resolve, reject) => {
      const res = pilot.putTargetHeading(undefined, undefined, value)
      if (res.statusCode === FAILURE_RES.statusCode) {
        reject(new Error(res.message))
      } else {
        resolve()
      }
    })
  }

  pilot.putTargetHeading = (context, path, value, _cb) => {
    var state = app.getSelfPath(state_path)

    if (state !== 'auto') {
      return { message: 'Autopilot not in auto mode', ...FAILURE_RES }
    } else {
      var new_value = Math.trunc(radsToDeg(value))
      var quadrant = parseInt(new_value / 90)
      var rest = parseInt(new_value - quadrant * 90)
      var VW = parseInt(rest / 2)
      rest = rest - VW * 2
      var U = 0x02
      U |= quadrant << (4 + 2)
      U |= (new_value % 2) << 7
      VW = 0x3f & ((new_value - quadrant * 90) / 2)
      var XY = 0x00
      var Z = 0x20

      var msg = util.format(
        targetHeading,
        U.toString(16),
        VW.toString(16),
        XY.toString(16),
        Z.toString(16)
      )
      sendDatagram([msg])
      return SUCCESS_RES
    }
  }

  pilot.putStatePromise = (value) => {
    return new Promise((resolve, reject) => {
      const res = pilot.putState(undefined, undefined, value)
      if (res.statusCode === FAILURE_RES.statusCode) {
        reject(new Error(res.message))
      } else {
        resolve()
      }
    })
  }

  pilot.putState = (context, path, value, _cb) => {
    if (!state_commands[value]) {
      return { message: `Invalid state: ${value}`, ...FAILURE_RES }
    } else {
      var msg = state_commands[value]
      sendDatagram([msg])
      return SUCCESS_RES
    }
  }

  pilot.putTargetWindPromise = (value) => {
    return new Promise((resolve, reject) => {
      const res = pilot.putTargetWind(undefined, undefined, value)
      if (res.statusCode === FAILURE_RES.statusCode) {
        reject(new Error(res.message))
      } else {
        resolve()
      }
    })
  }

  pilot.putTargetWind = (context, path, value, _cb) => {
    var state = app.getSelfPath(state_path)

    if (state !== 'wind') {
      return { message: 'Autopilot not in wind vane mode', ...FAILURE_RES }
    } else {
      var new_value = Math.trunc(value)
      if (new_value > 180) new_value -= 180
      var XX = 2 * parseInt(new_value / 256)
      var YY = 2 * (new_value - XX)
      var msg = util.format(
        wind_direction_command,
        XX.toString(16),
        YY.toString(16)
      )
      /*
      10  01  XX  YY  Apparent Wind Angle: XXYY/2 degrees right of bow
                      Used for autopilots Vane Mode (WindTrim)
                      Corresponding NMEA sentence: MWV
      */
      /*
      var msg = util.format(command_format, (new Date()).toISOString(), default_src,
                            autopilot_dst, padd((new_value & 0xff).toString(16), 2), padd(((new_value >> 8) & 0xff).toString(16), 2))
      */

      sendDatagram([msg])
      return SUCCESS_RES
    }
  }

  pilot.putAdjustHeadingPromise = (value) => {
    return new Promise((resolve, reject) => {
      const res = pilot.putAdjustHeading(undefined, undefined, value)
      if (res.statusCode === FAILURE_RES.statusCode) {
        reject(new Error(res.message))
      } else {
        resolve()
      }
    })
  }

  pilot.putAdjustHeading = (context, path, value, _cb) => {
    var state = app.getSelfPath(state_path)

    if (state !== 'auto' && state != 'standby' && state != 'route') {
      return {
        message: 'Autopilot not in auto, standby or route mode',
        ...FAILURE_RES
      }
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
      sendDatagram(changeHeadingByKey(app, outputEvent, { value: aString }))
      return SUCCESS_RES
    }
  }

  pilot.putTackPromise = (value) => {
    return new Promise((resolve, reject) => {
      const res = pilot.putTack(undefined, undefined, value)
      if (res.statusCode === FAILURE_RES.statusCode) {
        reject(new Error(res.message))
      } else {
        resolve()
      }
    })
  }

  pilot.putTack = (context, path, value, _cb) => {
    var state = app.getSelfPath(state_path)

    if (state !== 'wind' && state !== 'auto') {
      return { message: 'Autopilot not in wind or auto mode', ...FAILURE_RES }
    } else {
      sendDatagram(tackTo(app, outputEvent, { value: value }))
      return SUCCESS_RES
    }
  }

  pilot.putAdvanceWaypoint = (_context, _path, _value, _cb) => {
    var state = app.getSelfPath(state_path)

    if (state !== 'track') {
      return { message: 'Autopilot not in track mode', ...FAILURE_RES }
    } else {
      return {
        message: 'Autopilot next waypoint not implemented',
        ...FAILURE_RES
      }
    }
  }

  pilot.properties = () => {
    let defaultEvent = 'seatalkOut'

    return {
      outputEvent: {
        type: 'string',
        title: 'NMEA 0183 outputEvent for the Seatalk Connection',
        default: defaultEvent
      }
    }
  }

  return pilot
}

function tackTo(app, outputEvent, command_json) {
  var tackTo = command_json['value']
  app.debug('tackTo: ' + tackTo)
  if (tackTo === 'port') {
    return keys_code['-1-10']
  } else if (tackTo === 'starboard') {
    return keys_code['+1+10']
  } else {
    app.debug('tackTo: unknown ' + tackTo)
  }
}

function changeHeadingByKey(app, outputEvent, command_json) {
  var key = command_json['value']
  app.debug('changeHeadingByKey: ' + key)
  return keys_code[key]
}

function radsToDeg(radians) {
  return (radians * 180) / Math.PI
}

function toSentence(parts) {
  var base = parts.join(',')
  return base + computeChecksum(base)
}
var m_hex = [
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'A',
  'B',
  'C',
  'D',
  'E',
  'F'
]

function computeChecksum(sentence) {
  var c1
  var i

  // skip the $
  i = 1

  // init to first character    var count;

  c1 = sentence.charCodeAt(i)

  // process rest of characters, zero delimited
  for (i = 2; i < sentence.length; ++i) {
    c1 = c1 ^ sentence.charCodeAt(i)
  }

  return '*' + toHexString(c1)
}

function toHexString(v) {
  var lsn
  var msn

  msn = (v >> 4) & 0x0f
  lsn = (v >> 0) & 0x0f
  return m_hex[msn] + m_hex[lsn]
}
