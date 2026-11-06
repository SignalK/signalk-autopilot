/* eslint-disable @typescript-eslint/no-explicit-any */
/*
 * Copyright 2025 Scott Bender <scott@scottbender.net>
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

import { expect } from 'chai'
import plugin, { types, Autopilot } from '../dist/index'
import { TestApp, ExpectedEvent } from './utils'

describe('test emulator autopilot', function () {
  it('uses cross-track error to correct route target heading', () => {
    const app = new TestApp([], {
      'navigation.course.calcValues.bearingTrackTrue.value': Math.PI / 2,
      'navigation.magneticVariation.value': Math.PI / 18,
      'navigation.course.calcValues.crossTrackError.value': 500
    })

    const autopilot: Autopilot = types.emulator(app)
    autopilot.start({ routeXteLookahead: 500, routeMaxXteCorrection: 45 })

    try {
      autopilot.putState(undefined, undefined, 'route')
      expect(
        app.getSelfPath('steering.autopilot.target.headingMagnetic.value')
      ).to.be.closeTo((7 * Math.PI) / 36, 0.000001)

      app.paths['navigation.course.calcValues.crossTrackError.value'] = -500
      autopilot.putState(undefined, undefined, 'route')
      expect(
        app.getSelfPath('steering.autopilot.target.headingMagnetic.value')
      ).to.be.closeTo((25 * Math.PI) / 36, 0.000001)
    } finally {
      autopilot.stop()
    }
  })

  it('exposes route as an available mode', () => {
    const app = new TestApp([])
    const autopilot: Autopilot = types.emulator(app)
    autopilot.start({})

    try {
      expect(autopilot.modes?.()).to.deep.equal(['auto', 'wind', 'route'])
      const stateNames = autopilot.states?.().map((s) => s.name)
      expect(stateNames).to.include('route')
    } finally {
      autopilot.stop()
    }
  })

  it('sets the absolute apparent wind target in wind mode', () => {
    const app = new TestApp([], {
      'steering.autopilot.state.value': 'wind'
    })

    const autopilot: Autopilot = types.emulator(app)
    autopilot.start({})

    try {
      const res = autopilot.putTargetWind(undefined, undefined, -30)
      expect(res.statusCode).to.equal(200)
      expect(
        app.getSelfPath('steering.autopilot.target.windAngleApparent.value')
      ).to.be.closeTo(-Math.PI / 6, 0.000001)
    } finally {
      autopilot.stop()
    }
  })

  it('tacks by flipping the target apparent wind angle side', () => {
    const app = new TestApp([], {
      'steering.autopilot.state.value': 'wind',
      'environment.wind.angleApparent.value': -Math.PI / 4
    })

    const autopilot: Autopilot = types.emulator(app)
    autopilot.start({})

    try {
      autopilot.putState(undefined, undefined, 'wind')

      let res = autopilot.putTack(undefined, undefined, 'starboard')
      expect(res.statusCode).to.equal(200)
      expect(
        app.getSelfPath('steering.autopilot.target.windAngleApparent.value')
      ).to.be.closeTo(Math.PI / 4, 0.000001)

      res = autopilot.putTack(undefined, undefined, 'port')
      expect(res.statusCode).to.equal(200)
      expect(
        app.getSelfPath('steering.autopilot.target.windAngleApparent.value')
      ).to.be.closeTo(-Math.PI / 4, 0.000001)
    } finally {
      autopilot.stop()
    }
  })
})

Object.entries(types).forEach(([name, type]) => {
  if (name === 'emulator') {
    return
  }
  describe(`test ${name} autopilot`, function () {
    it(`putState works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,01,FE*4D'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126720,1,115,16,3b,9f,f0,81,86,21,01,fe,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65379,
                numberOfParameters: 4,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 4,
                    value: 'Auto, compass commanded'
                  },
                  {
                    parameter: 5,
                    value: 65535
                  }
                ],
                priority: 'Leave unchanged'
              }
            },
            generates: [
              {
                path: 'steering.autopilot.state',
                value: 'auto'
              }
            ]
          }
        ],
        simrad: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 130850,
              prio: 2,
              dst: 255,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Simrad',
                industryCode: 'Marine Industry',
                commandType: 'AP Command',
                event: 'Heading mode',
                address: 3,
                reserved5: 0
              }
            },
            generates: [
              {
                path: 'steering.autopilot.state',
                value: 'auto'
              }
            ]
          }
        ]
      }

      if (!expected[name]) {
        done()
        return
      }
      const app = new TestApp(expected[name])

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putState(
        undefined,
        undefined,
        'auto',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putTargetHeading works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,89,1c82,1a,0,20*56' //FIXME: this is not correct
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,14,01,50,ff,00,f8,03,01,3b,07,03,04,06,b7,7a/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65360,
                numberOfParameters: 3,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 6,
                    value: 3.141592653589793
                  }
                ],
                priority: 'Leave unchanged'
              }
            },
            generates: [
              {
                path: 'steering.autopilot.target.headingMagnetic',
                value: 3.141592653589793
              }
            ]
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'auto'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putTargetHeading(
          undefined,
          undefined,
          180,
          (res: any) => {
            expect(res.state).to.equal('COMPLETED')
            done()
          }
        )
        expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
        if (res.state === 'COMPLETED') {
          expect(res.statusCode).to.equal(200)
          done()
        }
      } else {
        done()
      }
    })

    it(`putTargetWind works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,10,01,0,3c*21'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126720,1,115,16,3b,9f,f0,81,86,21,23,dc,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,14,01,41,ff,00,f8,03,01,3b,07,03,04,04,74,14/,
            generates: [
              {
                path: 'steering.autopilot.target.windAngleApparent',
                value: 0.5235987755982988
              }
            ]
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'wind'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putTargetWind(
          undefined,
          undefined,
          30,
          (res: any) => {
            expect(res.state).to.equal('COMPLETED')
            expect(res.statusCode).to.equal(200)
            done()
          }
        )
        expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
        if (res.state === 'COMPLETED') {
          expect(res.statusCode).to.equal(200)
          done()
        }
      } else {
        done()
      }
    })

    it(`putAdjustHeading works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,07,F8*36'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,7,126720,1,255,16,3b,9f,f0,81,86,21,07,f8,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126720,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Raymarine',
                industryCode: 'Marine Industry',
                command: 'Seatalk1',
                proprietaryId: 'Seatalk 1 Encoded',
                seatalk1Command: 'Keystroke',
                device: 33,
                key: '+1',
                keyinverted: 248
              }
            }
          }
        ],
        simrad: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 130850,
              prio: 2,
              dst: 255,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Simrad',
                industryCode: 'Marine Industry',
                event: 'Change course',
                address: 3,
                commandType: 'AP Command',
                reserved5: 0,
                direction: 'Starboard',
                angle: 0.017453292519943295
              }
            }
          }
        ],
        emulator: []
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'auto'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putAdjustHeading(
        undefined,
        undefined,
        1,
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putTack works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'seatalkOut',
            value: '$STALK,86,11,21,DE*4D'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,7,126720,1,255,16,3b,9f,f0,81,86,21,21,de,07,01,02,00,00,00,00,00,00,00,00,00,00,00,ff,ff,ff,ff,ff/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65379,
                numberOfParameters: 4,
                list: [
                  { parameter: 1, value: 'Raymarine' },
                  { parameter: 3, value: 'Marine Industry' },
                  { parameter: 4, value: 65535 },
                  { parameter: 5, value: 4 }
                ],
                priority: 'Leave unchanged'
              }
            }
          }
        ],
        simrad: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 130850,
              prio: 2,
              dst: 255,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                manufacturerCode: 'Simrad',
                industryCode: 'Marine Industry',
                commandType: 'AP Command',
                event: 'Tack',
                address: 3,
                unknownA: 0,
                unknownB: 0
              }
            }
          }
        ]
      }

      if (!expected[name]) {
        done()
        return
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'wind'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      const res = autopilot.putTack(
        undefined,
        undefined,
        'port',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putAdvanceWaypoint works`, (done) => {
      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineST: [
          {
            event: 'error',
            value: 'Autopilot next waypoint not implemented'
          }
        ],
        raySTNGConv: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,17,01,63,ff,00,f8,04,01,3b,07,03,04,04,81,01,05,ff,ff/
          },
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,115,21,00,00,ef,01,ff,ff,ff,ff,ff,ff,04,01,3b,07,03,04,04,6c,05,1a,50/
          }
        ],
        raymarineN2K: [
          {
            event: 'nmea2000JsonOut',
            value: {
              description: undefined,
              pgn: 126208,
              prio: 3,
              dst: 204,
              input: undefined,
              src: undefined,
              timestamp: undefined,
              fields: {
                functionCode: 'Command',
                pgn: 65379,
                numberOfParameters: 4,
                list: [
                  {
                    parameter: 1,
                    value: 'Raymarine'
                  },
                  {
                    parameter: 3,
                    value: 'Marine Industry'
                  },
                  {
                    parameter: 4,
                    value: 'No Drift, COG referenced (In track, course changes)'
                  },
                  {
                    parameter: 5,
                    value: 65535
                  }
                ],
                priority: 'Leave unchanged'
              }
            }
          },
          {
            // The proprietary track-to-waypoint command that actually
            // advances the EV-1. Wire form: a PGN 126208 Group Function
            // (`,3,126208,...`) whose `00 ef 01` payload targets the inner
            // PGN 126720 (Seatalk1 Encoded), with `6c 05 1a 50` identifying
            // it as TTW. Emitted right after the 65379 mode-set above;
            // without it the pilot sets the track sub-mode but does not
            // move to the next waypoint.
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,21,00,00,ef,01,ff,ff,ff,ff,ff,ff,04,01,3b,07,03,04,04,6c,05,1a,50/
          }
        ]
      }

      if (expected[name]) {
        const app = new TestApp(expected[name], {
          'steering.autopilot.state.value': 'route'
        })

        const autopilot: Autopilot = type(app)
        autopilot.start({})

        const res = autopilot.putAdvanceWaypoint(
          undefined,
          undefined,
          1,
          (res: any) => {
            if (name === 'raymarineST') {
              expect(res.state).to.equal('COMPLETED')
              expect(res.statusCode).to.equal(400)
            } else {
              expect(res.state).to.equal('COMPLETED')
              expect(res.statusCode).to.equal(200)
            }
            done()
          }
        )

        if (name === 'raymarineST') {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(400)
          done()
        } else {
          expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
          if (res.state === 'COMPLETED') {
            expect(res.statusCode).to.equal(200)
            if (name === 'raymarineN2K') {
              // TestApp.emit silently tolerates missing trailing events, so
              // without an explicit check a dropped TTW frame (the 2nd) would
              // pass through. Confirm that every expected event was consumed.
              // Using `at.least` so the test remains robust to unrelated
              // future emits while still catching the missing-frame regression.
              expect(app.eventCount).to.be.at.least(expected[name].length)
            }
            done()
          }
        }
      } else {
        done()
      }
    })

    it(`putHullType works`, (done) => {
      if (name !== 'raymarineN2K') {
        // putHullType is only implemented in raymarineN2K
        done()
        return
      }

      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,19,01,00,ef,01,f8,05,01,3b,07,03,04,04,6c,05,16,50,06,08,52,ff/
          }
        ]
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'standby'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      if (!autopilot.putHullType) {
        done()
        return
      }

      const res = autopilot.putHullType(
        undefined,
        undefined,
        'power',
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(200)
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })

    it(`putAutoTurn works`, (done) => {
      if (name !== 'raymarineN2K') {
        // putAutoTurn is only implemented in raymarineN2K
        done()
        return
      }

      const expected: { [key: string]: ExpectedEvent[] } = {
        raymarineN2K: [
          {
            event: 'nmea2000out',
            value:
              /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z,3,126208,1,204,18,01,00,ef,01,f8,05,01,3b,07,03,04,04,6c,05,26,50,06,01$/
          }
        ]
      }

      const app = new TestApp(expected[name], {
        'steering.autopilot.state.value': 'standby'
      })

      const autopilot: Autopilot = type(app)
      autopilot.start({})

      if (!autopilot.putAutoTurn) {
        done()
        return
      }

      const res = autopilot.putAutoTurn(
        undefined,
        undefined,
        true,
        (res: any) => {
          expect(res.state).to.equal('COMPLETED')
          expect(res.statusCode).to.equal(200)
          done()
        }
      )
      expect(res.state).to.be.oneOf(['COMPLETED', 'PENDING'])
      if (res.state === 'COMPLETED') {
        expect(res.statusCode).to.equal(200)
        done()
      }
    })
  })
})

// Simnet's Heading mode is the specification's auto and No Drift is
// noDrift; n2k-signalk before SignalK/n2k-signalk#404 wrote them as heading
// and auto.
describe('test simrad autopilot states', function () {
  const command = (event: string, state: string): ExpectedEvent => ({
    event: 'nmea2000JsonOut',
    value: {
      description: undefined,
      pgn: 130850,
      prio: 2,
      dst: 255,
      input: undefined,
      src: undefined,
      timestamp: undefined,
      fields: {
        manufacturerCode: 'Simrad',
        industryCode: 'Marine Industry',
        commandType: 'AP Command',
        event,
        address: 3,
        reserved5: 0
      }
    },
    generates: [{ path: 'steering.autopilot.state', value: state }]
  })

  // Sets `state`, which the pilot then reports as `reported`.
  const putState = (
    state: string,
    event: string,
    reported: string,
    done: Mocha.Done
  ) => {
    const app = new TestApp([command(event, reported)])
    const autopilot: Autopilot = types.simrad(app)
    autopilot.start({})
    const res = autopilot.putState(undefined, undefined, state, (res: any) => {
      expect(res.statusCode).to.equal(200)
      done()
    })
    expect(res.state).to.equal('PENDING')
  }

  it('lists the specification states', () => {
    const autopilot: Autopilot = types.simrad(new TestApp([]))
    expect(autopilot.states().map((s) => s.name)).to.deep.equal([
      'standby',
      'auto',
      'noDrift',
      'wind',
      'route'
    ])
  })

  it('sets noDrift with the No Drift command', (done) => {
    putState('noDrift', 'No Drift mode', 'noDrift', done)
  })

  it('takes heading as auto', (done) => {
    putState('heading', 'Heading mode', 'auto', done)
  })

  it('confirms auto by what an older n2k-signalk writes', (done) => {
    putState('auto', 'Heading mode', 'heading', done)
  })

  it('confirms noDrift by what an older n2k-signalk writes', (done) => {
    putState('noDrift', 'No Drift mode', 'auto', done)
  })
  ;['auto', 'noDrift', 'wind', 'heading'].forEach((state) => {
    it(`adjusts the heading and tacks in ${state}`, () => {
      const app = new TestApp([], { 'steering.autopilot.state.value': state })
      const autopilot: Autopilot = types.simrad(app)
      autopilot.start({})
      expect(
        autopilot.putAdjustHeading(undefined, undefined, 1, () => {}).statusCode
      ).to.equal(200)
      expect(
        autopilot.putTack(undefined, undefined, 'port', () => {}).statusCode
      ).to.equal(200)
    })
  })
  ;['standby', 'route'].forEach((state) => {
    it(`refuses to adjust the heading or tack in ${state}`, () => {
      const app = new TestApp([], { 'steering.autopilot.state.value': state })
      const autopilot: Autopilot = types.simrad(app)
      autopilot.start({})
      expect(
        autopilot.putAdjustHeading(undefined, undefined, 1, () => {}).statusCode
      ).to.equal(400)
      expect(
        autopilot.putTack(undefined, undefined, 'port', () => {}).statusCode
      ).to.equal(400)
    })
  })
})

// The V2 autopilot API takes and reports a Simrad pilot's states through the
// provider's normalizeState: heading, from an older n2k-signalk or a client,
// is auto.
describe('simrad autopilot through the V2 API', function () {
  const start = () => {
    const paths: { [path: string]: any } = {}
    const updates: any[] = []
    const commands: string[] = []
    let provider: any
    let onDelta: (delta: any) => void = () => {}
    const app: any = {
      debug: () => {},
      error: () => {},
      handleMessage: () => {},
      registerPutHandler: () => {},
      registerAutopilotProvider: (p: any) => {
        provider = p
      },
      autopilotUpdate: (_type: string, update: any) => updates.push(update),
      getSelfPath: (path: string) => paths[path],
      // The pilot reports the state its command selects.
      emit: (_event: string, pgn: any) => {
        const reported: { [event: string]: string } = {
          'Heading mode': 'heading',
          'No Drift mode': 'auto'
        }
        commands.push(pgn.fields?.event)
        const state = reported[pgn.fields?.event]
        if (state) {
          paths['steering.autopilot.state.value'] = state
        }
      },
      subscriptionmanager: {
        subscribe: (
          _sub: any,
          _onStop: any,
          _err: any,
          cb: (delta: any) => void
        ) => {
          onDelta = cb
        }
      }
    }
    const instance = plugin(app)
    instance.start({ type: 'simrad' })
    const report = (value: string) =>
      onDelta({
        updates: [
          {
            $source: 'autopilot',
            values: [{ path: 'steering.autopilot.state', value }]
          }
        ]
      })
    return { instance, provider, updates, commands, report }
  }

  it('reports heading as auto', async () => {
    const { instance, updates, report } = start()
    try {
      report('heading')
      await new Promise((resolve) => setImmediate(resolve))
      expect(updates).to.deep.equal([{ state: 'auto', engaged: true }])
    } finally {
      instance.stop()
    }
  })

  it('takes heading as auto', async () => {
    const { instance, provider, commands } = start()
    try {
      // Resolves once the pilot reports the state, as an older n2k-signalk
      // writes it.
      await provider.setState('heading')
      expect(commands).to.deep.equal(['Heading mode'])
    } finally {
      instance.stop()
    }
  })

  it('still refuses a state it does not have', async () => {
    const { instance, provider } = start()
    try {
      let error: Error | undefined
      await provider.setState('track').catch((e: Error) => {
        error = e
      })
      expect(error?.message).to.equal('track is not a valid value!')
    } finally {
      instance.stop()
    }
  })
})
