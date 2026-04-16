#!/usr/bin/env node
// generate-test-data.js
// Generates realistic fake data for the Gather church management system.
// Output: src/test-data/*.json
// Usage: node scripts/generate-test-data.js

import { faker } from '@faker-js/faker'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT_DIR = join(__dirname, '..', 'src', 'test-data')

mkdirSync(OUT_DIR, { recursive: true })

faker.seed(42) // deterministic output

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uuid() {
  return faker.string.uuid()
}

function testPhone() {
  return `+1555${faker.string.numeric(7)}`
}

function isoNow() {
  return new Date().toISOString()
}

function isoDate(date) {
  return date.toISOString().split('T')[0]
}

function pastDate(days) {
  return isoDate(faker.date.recent({ days }))
}

function futureDate(days) {
  return isoDate(faker.date.soon({ days }))
}

function pickCode() {
  return faker.string.numeric(4)
}

const GRADES = ['Pre-K', 'K', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th']
const PRONOUNS = ['he/him', 'she/her', 'they/them', 'he/they', 'she/they']
const RELATIONSHIP_STATUSES = ['married', 'single', 'partnered', 'divorced', 'co-parenting', 'widowed', 'other']
const MEMBERSHIP_STATUSES = ['member', 'regular_attender', 'visitor', 'inactive']
const ALLERGIES = ['Peanuts', 'Tree nuts', 'Dairy', 'Eggs', 'Gluten', 'Shellfish', 'Soy', 'Latex']
const VISITOR_SOURCES = [
  'Friend or family',
  'Drive by',
  'Social media',
  'Google search',
  'Event',
  'Community outreach',
]
const FUNDS = ['general', 'missions', 'building', 'youth', 'benevolence']
const METHODS = ['online_card', 'online_ach', 'cash', 'check']
const SOURCES = ['stripe', 'square', 'manual', 'imported']

// ─── 1. Adults ───────────────────────────────────────────────────────────────

console.log('Generating 150 adults...')
const adults = []
for (let i = 0; i < 150; i++) {
  const gender = faker.helpers.arrayElement(['male', 'female', 'nonbinary'])
  const firstName = gender === 'male'
    ? faker.person.firstName('male')
    : gender === 'female'
    ? faker.person.firstName('female')
    : faker.person.firstName()
  const lastName = faker.person.lastName()
  const hasPreferredName = Math.random() < 0.15
  const hasPronouns = Math.random() < 0.25
  const hasMembership = Math.random() < 0.8

  adults.push({
    id: uuid(),
    first_name: firstName,
    last_name: lastName,
    preferred_name: hasPreferredName ? faker.person.firstName() : undefined,
    pronouns: hasPronouns ? faker.helpers.arrayElement(PRONOUNS) : undefined,
    email: faker.internet.email({ firstName, lastName }).toLowerCase(),
    phone: testPhone(),
    date_of_birth: isoDate(faker.date.birthdate({ min: 18, max: 80, mode: 'age' })),
    grade: undefined,
    is_child: false,
    gender_identity: gender === 'nonbinary' ? 'non-binary' : gender,
    relationship_status: faker.helpers.arrayElement(RELATIONSHIP_STATUSES),
    membership_status: hasMembership ? faker.helpers.arrayElement(MEMBERSHIP_STATUSES) : undefined,
    allergies: undefined,
    medical_notes: undefined,
    special_needs: undefined,
    custom_field_1: undefined,
    custom_field_2: undefined,
    photo_url: undefined,
    created_at: isoNow(),
    updated_at: isoNow(),
    is_active: Math.random() > 0.05,
    visitor_source: Math.random() < 0.3 ? faker.helpers.arrayElement(VISITOR_SOURCES) : undefined,
    first_visit_date: Math.random() < 0.4 ? pastDate(730) : undefined,
  })
}

// ─── 2. Children ─────────────────────────────────────────────────────────────

console.log('Generating 75 children...')
const children = []
for (let i = 0; i < 75; i++) {
  const firstName = faker.person.firstName()
  const lastName = faker.person.lastName()
  const hasAllergy = Math.random() < 0.25
  const hasBehavioralNote = Math.random() < 0.1
  const grade = faker.helpers.arrayElement(GRADES)

  children.push({
    id: uuid(),
    first_name: firstName,
    last_name: lastName,
    preferred_name: Math.random() < 0.1 ? faker.person.firstName() : undefined,
    pronouns: Math.random() < 0.05 ? faker.helpers.arrayElement(PRONOUNS) : undefined,
    email: undefined,
    phone: testPhone(), // for lookup
    date_of_birth: isoDate(faker.date.birthdate({ min: 3, max: 17, mode: 'age' })),
    grade,
    is_child: true,
    gender_identity: undefined,
    relationship_status: undefined,
    membership_status: undefined,
    allergies: hasAllergy ? faker.helpers.arrayElement(ALLERGIES) : undefined,
    medical_notes: hasBehavioralNote ? faker.lorem.sentence() : undefined,
    special_needs: undefined,
    custom_field_1: undefined,
    custom_field_2: undefined,
    photo_url: undefined,
    created_at: isoNow(),
    updated_at: isoNow(),
    is_active: true,
    visitor_source: undefined,
    first_visit_date: pastDate(365),
  })
}

const people = [...adults, ...children]

// ─── 3. Households ───────────────────────────────────────────────────────────

console.log('Generating 50 households...')
const households = []
const householdMembers = []
const childPickups = []

function makeHousehold(name, primaryContactId) {
  return {
    id: uuid(),
    name,
    address_line_1: faker.location.streetAddress(),
    address_line_2: Math.random() < 0.2 ? faker.location.secondaryAddress() : undefined,
    city: faker.location.city(),
    state: faker.location.state({ abbreviated: true }),
    zip: faker.location.zipCode('#####'),
    primary_contact_id: primaryContactId,
  }
}

function addMember(householdId, personId, role) {
  householdMembers.push({ id: uuid(), household_id: householdId, person_id: personId, role })
}

function addPickup(childId, householdId, authorizedPersonId, relationship, isPrimary) {
  childPickups.push({
    id: uuid(),
    child_id: childId,
    household_id: householdId,
    authorized_person_id: authorizedPersonId,
    relationship,
    is_primary: isPrimary,
    pickup_code: pickCode(),
    notes: undefined,
  })
}

let adultIdx = 0
let childIdx = 0

// 15 traditional two-parent households
for (let i = 0; i < 15 && adultIdx + 1 < adults.length; i++) {
  const parent1 = adults[adultIdx++]
  const parent2 = adults[adultIdx++]
  const hh = makeHousehold(`The ${parent1.last_name} Family`, parent1.id)
  households.push(hh)
  addMember(hh.id, parent1.id, 'adult')
  addMember(hh.id, parent2.id, 'adult')
  const kidCount = faker.number.int({ min: 1, max: 3 })
  for (let k = 0; k < kidCount && childIdx < children.length; k++) {
    const child = children[childIdx++]
    addMember(hh.id, child.id, 'child')
    addPickup(child.id, hh.id, parent1.id, 'parent', true)
    addPickup(child.id, hh.id, parent2.id, 'parent', false)
  }
}

// 10 single-parent households
for (let i = 0; i < 10 && adultIdx < adults.length; i++) {
  const parent = adults[adultIdx++]
  const hh = makeHousehold(`The ${parent.last_name} Family`, parent.id)
  households.push(hh)
  addMember(hh.id, parent.id, 'adult')
  const kidCount = faker.number.int({ min: 1, max: 2 })
  for (let k = 0; k < kidCount && childIdx < children.length; k++) {
    const child = children[childIdx++]
    addMember(hh.id, child.id, 'child')
    addPickup(child.id, hh.id, parent.id, 'parent', true)
  }
}

// 8 co-parenting households (child appears in 2 households)
for (let i = 0; i < 8 && adultIdx + 1 < adults.length; i++) {
  const parentA = adults[adultIdx++]
  const parentB = adults[adultIdx++]
  const hhA = makeHousehold(`${parentA.first_name} ${parentA.last_name} Household`, parentA.id)
  const hhB = makeHousehold(`${parentB.first_name} ${parentB.last_name} Household`, parentB.id)
  households.push(hhA, hhB)
  addMember(hhA.id, parentA.id, 'adult')
  addMember(hhB.id, parentB.id, 'adult')
  const kidCount = faker.number.int({ min: 1, max: 2 })
  for (let k = 0; k < kidCount && childIdx < children.length; k++) {
    const child = children[childIdx++]
    // Child in both households
    addMember(hhA.id, child.id, 'child')
    addMember(hhB.id, child.id, 'child')
    addPickup(child.id, hhA.id, parentA.id, 'parent', true)
    addPickup(child.id, hhA.id, parentB.id, 'parent', false)
    addPickup(child.id, hhB.id, parentB.id, 'parent', true)
    addPickup(child.id, hhB.id, parentA.id, 'parent', false)
  }
}

// 7 blended families
for (let i = 0; i < 7 && adultIdx + 1 < adults.length; i++) {
  const parent1 = adults[adultIdx++]
  const parent2 = adults[adultIdx++]
  const hh = makeHousehold(`The ${parent1.last_name}-${parent2.last_name} Family`, parent1.id)
  households.push(hh)
  addMember(hh.id, parent1.id, 'adult')
  addMember(hh.id, parent2.id, 'adult')
  const kidCount = faker.number.int({ min: 2, max: 4 })
  for (let k = 0; k < kidCount && childIdx < children.length; k++) {
    const child = children[childIdx++]
    addMember(hh.id, child.id, 'child')
    addPickup(child.id, hh.id, parent1.id, k % 2 === 0 ? 'parent' : 'stepparent', k % 2 === 0)
    addPickup(child.id, hh.id, parent2.id, k % 2 === 0 ? 'stepparent' : 'parent', k % 2 !== 0)
  }
}

// 5 single adults
for (let i = 0; i < 5 && adultIdx < adults.length; i++) {
  const adult = adults[adultIdx++]
  const hh = makeHousehold(`${adult.first_name} ${adult.last_name}`, adult.id)
  households.push(hh)
  addMember(hh.id, adult.id, 'adult')
}

// 5 couples without children
for (let i = 0; i < 5 && adultIdx + 1 < adults.length; i++) {
  const a1 = adults[adultIdx++]
  const a2 = adults[adultIdx++]
  const hh = makeHousehold(`The ${a1.last_name} Household`, a1.id)
  households.push(hh)
  addMember(hh.id, a1.id, 'adult')
  addMember(hh.id, a2.id, 'adult')
}

// Any remaining adults as roommate households
while (adultIdx < adults.length) {
  const roommates = []
  const count = Math.min(faker.number.int({ min: 2, max: 3 }), adults.length - adultIdx)
  for (let i = 0; i < count; i++) roommates.push(adults[adultIdx++])
  const hh = makeHousehold(`${roommates[0].last_name} St. Household`, roommates[0].id)
  households.push(hh)
  roommates.forEach(r => addMember(hh.id, r.id, 'adult'))
}

// ─── 4. Checkin Flags ────────────────────────────────────────────────────────

console.log('Generating checkin flags...')
const checkinFlags = []
// Custody alerts (3)
for (let i = 0; i < 3 && i < children.length; i++) {
  checkinFlags.push({
    id: uuid(),
    person_id: children[i].id,
    flag_type: 'custody_alert',
    flag_message: `Court order: only ${faker.person.firstName()} ${faker.person.lastName()} may pick up this child.`,
    is_active: true,
    created_by: adults[0].id,
    created_at: isoNow(),
  })
}
// Behavioral (4)
for (let i = 3; i < 7 && i < children.length; i++) {
  checkinFlags.push({
    id: uuid(),
    person_id: children[i].id,
    flag_type: 'behavioral',
    flag_message: faker.helpers.arrayElement([
      'Does not get along with child in Room 2 — please assign to Room 1.',
      'Tends to wander — extra supervision needed.',
      'Separation anxiety — needs 5 min settling time with parent.',
    ]),
    is_active: true,
    created_by: adults[1].id,
    created_at: isoNow(),
  })
}
// Medical (2)
for (let i = 7; i < 9 && i < children.length; i++) {
  checkinFlags.push({
    id: uuid(),
    person_id: children[i].id,
    flag_type: 'medical',
    flag_message: `Has epi-pen in bag. ${faker.lorem.sentence()}`,
    is_active: true,
    created_by: adults[2].id,
    created_at: isoNow(),
  })
}

// ─── 5. Teams ────────────────────────────────────────────────────────────────

console.log('Generating 8 volunteer teams...')
const teamDefs = [
  { name: 'Music', positions: ['Lead Vocals', 'Keys', 'Drums', 'Electric Guitar', 'Bass', 'Acoustic Guitar', 'Backup Vocals'] },
  { name: 'Tech', positions: ['Camera 1', 'Camera 2', 'Switcher', 'Sound Engineer', 'Lyrics', 'Lighting'] },
  { name: 'Kids Ministry', positions: ['Room 1 Lead', 'Room 2 Lead', 'Floater', 'Check-in Desk'] },
  { name: 'Greeting', positions: ['Front Door', 'Parking Lot', 'Welcome Desk'] },
  { name: 'Hospitality', positions: ['Coffee Bar', 'Setup', 'Teardown'] },
  { name: 'Ushers', positions: ['South Section', 'North Section', 'Offering'] },
  { name: 'Prayer', positions: ['Prayer Team Lead', 'Prayer Team Member'] },
  { name: 'First Impressions', positions: ['Coordinator', 'New Visitor Host'] },
]

const teams = teamDefs.map((def, idx) => ({
  id: uuid(),
  name: def.name,
  description: `The ${def.name} team serves our congregation each week.`,
  coordinator_id: adults[idx * 2]?.id,
  is_active: true,
  _positions: def.positions,
}))

const teamMembers = []
const rotationPrefs = ['every_week', '1st_sunday', '2nd_sunday', '3rd_sunday', '4th_sunday', 'every_other', 'as_needed']

teams.forEach((team, tIdx) => {
  const memberCount = faker.number.int({ min: 10, max: 25 })
  const startAdult = tIdx * 3
  for (let i = 0; i < memberCount && startAdult + i < adults.length; i++) {
    const person = adults[(startAdult + i) % adults.length]
    teamMembers.push({
      id: uuid(),
      team_id: team.id,
      person_id: person.id,
      role: i === 0 ? 'coordinator' : i < 3 ? 'leader' : 'member',
      rotation_preference: faker.helpers.arrayElement(rotationPrefs),
      joined_at: pastDate(365),
    })
  }
})

// ─── 6. Volunteer Schedule ───────────────────────────────────────────────────

console.log('Generating volunteer schedule entries...')
const volunteerSchedule = []
const volunteerBlackouts = []

// Generate 8 Sundays of schedule
const sundays = []
let d = new Date()
d.setDate(d.getDate() - d.getDay()) // last Sunday
for (let i = -2; i < 6; i++) {
  const s = new Date(d)
  s.setDate(d.getDate() + i * 7)
  sundays.push(isoDate(s))
}

teams.forEach(team => {
  const teamMemberList = teamMembers.filter(m => m.team_id === team.id)
  sundays.forEach(date => {
    const scheduled = faker.helpers.arrayElements(teamMemberList, Math.min(4, teamMemberList.length))
    scheduled.forEach((tm, idx) => {
      const status = date < isoDate(new Date()) ? 'confirmed' : faker.helpers.arrayElement(['pending', 'pending', 'confirmed', 'declined'])
      volunteerSchedule.push({
        id: uuid(),
        team_id: team.id,
        person_id: tm.person_id,
        scheduled_date: date,
        position: team._positions[idx % team._positions.length],
        status,
        confirmed_at: status === 'confirmed' ? isoNow() : undefined,
        reminder_sent: date < isoDate(new Date()),
        reminder_sent_at: date < isoDate(new Date()) ? isoNow() : undefined,
      })
    })
  })
})

// Blackouts for 5 people
for (let i = 0; i < 5; i++) {
  const person = adults[i + 20]
  volunteerBlackouts.push({
    id: uuid(),
    person_id: person.id,
    start_date: futureDate(14),
    end_date: futureDate(21),
    reason: faker.helpers.arrayElement(['Vacation', 'Business travel', 'Family commitment', undefined]),
  })
}

// ─── 7. Groups ───────────────────────────────────────────────────────────────

console.log('Generating 6 groups...')
const groupDefs = [
  { name: 'Young Adults Thursday', type: 'small_group', day: 'Thursday', time: '7:00 PM', open: true, visible: true, cat: 'Young Adults', cap: 20 },
  { name: "Men's Tuesday Bible Study", type: 'small_group', day: 'Tuesday', time: '6:30 AM', open: true, visible: true, cat: "Men's", cap: null },
  { name: "Women's Wednesday Study", type: 'class', day: 'Wednesday', time: '9:30 AM', open: true, visible: false, cat: "Women's", cap: 15 },
  { name: 'Young Couples', type: 'small_group', day: 'Friday', time: '6:30 PM', open: false, visible: false, cat: 'Couples', cap: 12 },
  { name: 'Grief Support', type: 'support', day: 'Monday', time: '6:00 PM', open: true, visible: true, cat: 'Recovery', cap: 10 },
  { name: 'Mixed Fellowship', type: 'small_group', day: 'Sunday', time: '12:30 PM', open: true, visible: true, cat: 'Mixed', cap: null },
]

const groups = groupDefs.map((def, idx) => ({
  id: uuid(),
  name: def.name,
  description: faker.lorem.sentences(2),
  group_type: def.type,
  meeting_day: def.day,
  meeting_time: def.time,
  location: Math.random() < 0.4 ? 'Online' : faker.location.streetAddress(),
  childcare_available: Math.random() < 0.4,
  leader_id: adults[idx + 100]?.id,
  max_capacity: def.cap,
  is_open: def.open,
  is_visible: def.visible,
  image_url: undefined,
  hook_text: faker.lorem.sentence(),
  category: def.cat,
  semester: 'Spring 2026',
  is_active: true,
}))

const groupMembers = []
groups.forEach((group, gIdx) => {
  const memberCount = faker.number.int({ min: 5, max: 15 })
  for (let i = 0; i < memberCount; i++) {
    const person = adults[(gIdx * 10 + i) % adults.length]
    const isWaitlisted = group.max_capacity && groupMembers.filter(m => m.group_id === group.id && m.status === 'active').length >= group.max_capacity
    groupMembers.push({
      id: uuid(),
      group_id: group.id,
      person_id: person.id,
      status: isWaitlisted ? 'waitlisted' : 'active',
      joined_at: pastDate(180),
    })
  }
})

// ─── 8. Events ───────────────────────────────────────────────────────────────

console.log('Generating 3 events...')
const events = [
  {
    id: uuid(),
    name: 'Spring Picnic & Family Celebration',
    description: 'Join us for a fun afternoon of food, games, and fellowship!',
    event_date: futureDate(30),
    event_time: '12:00 PM',
    location: 'Riverside Park Pavilion',
    max_capacity: null,
    registration_required: false,
    has_cost: false,
    cost_amount: undefined,
    cost_description: undefined,
    image_url: undefined,
    is_active: true,
  },
  {
    id: uuid(),
    name: 'Marriage Enrichment Retreat',
    description: 'A weekend retreat for couples to grow together.',
    event_date: futureDate(60),
    event_time: '5:00 PM',
    location: 'Blue Ridge Conference Center',
    max_capacity: 30,
    registration_required: true,
    has_cost: true,
    cost_amount: 149,
    cost_description: 'Includes lodging and meals',
    image_url: undefined,
    is_active: true,
  },
  {
    id: uuid(),
    name: 'Leadership Development Workshop',
    description: 'Training for current and future ministry leaders.',
    event_date: futureDate(14),
    event_time: '9:00 AM',
    location: 'Church Multipurpose Room',
    max_capacity: 25,
    registration_required: true,
    has_cost: false,
    cost_amount: undefined,
    cost_description: undefined,
    image_url: undefined,
    is_active: true,
  },
]

const eventRegistrations = []
// Fill the leadership workshop to capacity (waitlist some)
events.forEach(event => {
  if (!event.registration_required) return
  const regCount = event.max_capacity ? event.max_capacity + faker.number.int({ min: 2, max: 5 }) : faker.number.int({ min: 5, max: 20 })
  for (let i = 0; i < regCount && i < adults.length; i++) {
    const isWaitlisted = event.max_capacity && i >= event.max_capacity
    eventRegistrations.push({
      id: uuid(),
      event_id: event.id,
      person_id: adults[i].id,
      status: isWaitlisted ? 'waitlisted' : 'registered',
      payment_status: event.has_cost ? (isWaitlisted ? 'not_required' : faker.helpers.arrayElement(['pending', 'paid', 'paid'])) : 'not_required',
      payment_amount: event.has_cost && !isWaitlisted ? event.cost_amount : undefined,
      registered_at: isoNow(),
    })
  }
})

// ─── 9. Visitor Follow-Up ────────────────────────────────────────────────────

console.log('Generating 10 visitors in pipeline...')
const followupTemplates = [
  { id: uuid(), step_number: 1, step_name: 'Welcome Text', method: 'text', delay_days: 0, template_text: "Hi {{first_name}}, so glad you joined us today! We'd love to get to know you better.", is_active: true },
  { id: uuid(), step_number: 2, step_name: 'Welcome Email', method: 'email', delay_days: 3, template_text: "Hi {{first_name}}, thanks for visiting! Here's some info about what we're doing next...", is_active: true },
  { id: uuid(), step_number: 3, step_name: 'Follow-Up Call', method: 'call', delay_days: 6, template_text: 'Call to check in and answer questions before next Sunday.', is_active: true },
  { id: uuid(), step_number: 4, step_name: 'Group Invitation', method: 'email', delay_days: 10, template_text: 'Hi {{first_name}}, we thought you might enjoy one of our small groups!', is_active: true },
  { id: uuid(), step_number: 5, step_name: 'Check-In', method: 'text', delay_days: 21, template_text: "Hi {{first_name}}, just checking in! We hope to see you again soon.", is_active: true },
]

const visitorFollowup = []
// Use last 10 adults as visitors
const visitors = adults.slice(140)
visitors.forEach((visitor, vIdx) => {
  const stepsCompleted = faker.number.int({ min: 0, max: 4 })
  const visitDate = pastDate(30 - vIdx * 3)
  followupTemplates.forEach(template => {
    const dueDate = isoDate(new Date(new Date(visitDate).getTime() + template.delay_days * 86400000))
    const isCompleted = template.step_number <= stepsCompleted
    visitorFollowup.push({
      id: uuid(),
      person_id: visitor.id,
      step_number: template.step_number,
      step_name: template.step_name,
      due_date: dueDate,
      status: isCompleted ? 'completed' : 'pending',
      completed_at: isCompleted ? isoNow() : undefined,
      completed_by: isCompleted ? adults[0].id : undefined,
      notes: isCompleted && Math.random() < 0.3 ? faker.lorem.sentence() : undefined,
    })
  })
})

// ─── 10. Giving Records ──────────────────────────────────────────────────────

console.log('Generating 6 months of giving records...')
const givingRecords = []
const donors = adults.slice(0, 50)
const today = new Date()

donors.forEach(donor => {
  // Monthly giving (some give weekly)
  const frequency = faker.helpers.arrayElement(['weekly', 'biweekly', 'monthly'])
  const intervalDays = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 30
  const giftAmount = faker.number.int({ min: 25, max: 500 })
  const method = faker.helpers.arrayElement(METHODS)
  const fund = faker.helpers.arrayElement(FUNDS)

  for (let daysAgo = 180; daysAgo >= 0; daysAgo -= intervalDays) {
    const giftDate = new Date(today)
    giftDate.setDate(today.getDate() - daysAgo)
    if (giftDate > today) continue

    givingRecords.push({
      id: uuid(),
      person_id: donor.id,
      amount: giftAmount + faker.number.int({ min: -5, max: 5 }),
      date: isoDate(giftDate),
      method,
      fund,
      source: method === 'online_card' || method === 'online_ach' ? 'stripe' : 'manual',
      transaction_id: method === 'online_card' ? `txn_${faker.string.alphanumeric(20)}` : undefined,
      notes: undefined,
    })
  }
})

// ─── 11. App Config ──────────────────────────────────────────────────────────

const appConfig = [
  { key: 'church_name', value: 'Community Church', description: 'Full church name' },
  { key: 'custom_field_1_label', value: 'Pronouns', description: 'Label for custom field 1' },
  { key: 'custom_field_2_label', value: 'Special Instructions', description: 'Label for custom field 2' },
  { key: 'checkin_label_field_1', value: 'pronouns', description: 'First extra field on check-in label' },
  { key: 'checkin_label_field_2', value: 'parent_phone', description: 'Second extra field on check-in label' },
  { key: 'enable_membership_tracking', value: 'true', description: 'Show membership status fields' },
  { key: 'enable_giving_module', value: 'true', description: 'Enable giving features' },
  { key: 'giving_access_role', value: 'finance_admin', description: 'Role required to view giving data' },
  { key: 'kiosk_1_printer', value: 'DYMO-Front-Lobby', description: 'Printer for kiosk 1' },
  { key: 'kiosk_2_printer', value: 'DYMO-Side-Entrance', description: 'Printer for kiosk 2' },
  { key: 'kiosk_3_printer', value: 'DYMO-Kids-Wing', description: 'Printer for kiosk 3' },
  { key: 'visitor_followup_steps', value: '5', description: 'Number of follow-up pipeline steps' },
]

// ─── 12. Test Users ──────────────────────────────────────────────────────────
// These are special adults whose phone/email map to mock auth users

const testUsers = [
  { uid: 'test-public', tier: 0, isFinanceAdmin: false, personId: adults[0].id, email: 'public@test.com' },
  { uid: 'test-authenticated', tier: 1, isFinanceAdmin: false, personId: adults[1].id, email: 'user@test.com' },
  { uid: 'test-leader', tier: 2, isFinanceAdmin: false, personId: adults[2].id, email: 'leader@test.com' },
  { uid: 'test-staff', tier: 3, isFinanceAdmin: false, personId: adults[3].id, email: 'staff@test.com' },
  { uid: 'test-executive', tier: 4, isFinanceAdmin: false, personId: adults[4].id, email: 'executive@test.com' },
  { uid: 'test-finance', tier: 3, isFinanceAdmin: true, personId: adults[5].id, email: 'finance@test.com' },
]

// ─── Write Output ────────────────────────────────────────────────────────────

const files = {
  'people.json': people,
  'households.json': households,
  'household_members.json': householdMembers,
  'child_pickups.json': childPickups,
  'checkin_flags.json': checkinFlags,
  'teams.json': teams.map(({ _positions: _p, ...t }) => t),
  'team_positions.json': Object.fromEntries(teams.map(t => [t.id, t._positions])),
  'team_members.json': teamMembers,
  'volunteer_schedule.json': volunteerSchedule,
  'volunteer_blackouts.json': volunteerBlackouts,
  'groups.json': groups,
  'group_members.json': groupMembers,
  'events.json': events,
  'event_registrations.json': eventRegistrations,
  'visitor_followup.json': visitorFollowup,
  'followup_templates.json': followupTemplates,
  'giving_records.json': givingRecords,
  'app_config.json': appConfig,
  'test_users.json': testUsers,
}

for (const [filename, data] of Object.entries(files)) {
  writeFileSync(join(OUT_DIR, filename), JSON.stringify(data, null, 2))
}

// ─── Summary ─────────────────────────────────────────────────────────────────

console.log('\n✅ Test data generated successfully!\n')
console.log(`  People:              ${people.length} (${adults.length} adults, ${children.length} children)`)
console.log(`  Households:          ${households.length}`)
console.log(`  Household members:   ${householdMembers.length}`)
console.log(`  Child pickups:       ${childPickups.length}`)
console.log(`  Checkin flags:       ${checkinFlags.length}`)
console.log(`  Teams:               ${teams.length}`)
console.log(`  Team members:        ${teamMembers.length}`)
console.log(`  Volunteer schedules: ${volunteerSchedule.length}`)
console.log(`  Volunteer blackouts: ${volunteerBlackouts.length}`)
console.log(`  Groups:              ${groups.length}`)
console.log(`  Group members:       ${groupMembers.length}`)
console.log(`  Events:              ${events.length}`)
console.log(`  Event registrations: ${eventRegistrations.length}`)
console.log(`  Visitor followups:   ${visitorFollowup.length}`)
console.log(`  Giving records:      ${givingRecords.length}`)
console.log(`  Test users:          ${testUsers.length}`)
console.log(`\n  Output: src/test-data/\n`)
