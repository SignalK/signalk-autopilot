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

export type ExpectedEvent = {
  event: string
  value: any
  generates?: [{ [key: string]: any }]
  paths?: { [key: string]: any }
}

export class TestApp {
  paths: { [key: string]: any } = {}
  expectedEvents: ExpectedEvent[]
  eventCount: number = 0

  constructor(expectedEvents: ExpectedEvent[], paths?: { [key: string]: any }) {
    this.expectedEvents = expectedEvents
    if (paths) {
      this.paths = paths
    }
    expectedEvents.forEach((e) => {
      if (e.paths) {
        Object.entries(e.paths).forEach(([path, value]) => {
          this.paths[path] = value
          // console.log(`set ${path} to ${value}`)
        })
      }
    })
  }

  debug(_msg: string) {
    // console.log(`debug: ${msg}`)
  }
  emit(event: string, msg: any) {
    const expected = this.expectedEvents[this.eventCount++]
    if (expected) {
      //console.log(`emit ${event}`, JSON.stringify(msg, null, 2))
      expect(event).to.equal(expected.event)
      if (typeof expected.value === 'string') {
        expect(msg).to.eq(expected.value)
      } else if (expected.value instanceof RegExp) {
        expect(msg).to.match(expected.value)
      } else if (typeof expected.value === 'object') {
        expect(msg).to.deep.equal(expected.value)
      }
      if (expected.generates) {
        expected.generates.forEach((e) => {
          this.paths[`${e.path}.value`] = e.value
          //console.log(`set ${e.path} to ${e.value}`)
        })
      }
    }
  }

  getSelfPath(path: string) {
    const res = this.paths[path]
    //console.log(`getSelfPath ${path} => ${res}`)
    return res
  }

  registerPutHandler() {}

  handleMessage(id: string, msg: any) {
    // console.log(`handleMessage ${id}`, msg)
    msg.updates.forEach((update: any) => {
      if (update.values) {
        update.values.forEach((value: any) => {
          this.paths[`${value.path}.value`] = value.value
          // console.log(`set ${value.path}.value to ${value.value}`)
        })
      }
    })
  }
}
