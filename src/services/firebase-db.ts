// firebase-db.ts
// Real Firebase/Firestore implementation.
// Phase 1: Stubbed — real implementations added in Phase 2+ as needed.
// Each method throws a clear error so developers know what's unimplemented.

import type { DatabaseService } from './db-interface'

function notImplemented(method: string): never {
  throw new Error(
    `firebase-db: ${method} is not yet implemented. Set VITE_TEST_MODE=true to use in-memory data.`
  )
}

export const firebaseDb: DatabaseService = {
  async getPeople() { notImplemented('getPeople') },
  async getPerson() { notImplemented('getPerson') },
  async getPersonByPhone() { notImplemented('getPersonByPhone') },
  async createPerson() { notImplemented('createPerson') },
  async updatePerson() { notImplemented('updatePerson') },
  async deletePerson() { notImplemented('deletePerson') },
  async searchPeople() { notImplemented('searchPeople') },

  async getHouseholds() { notImplemented('getHouseholds') },
  async getHousehold() { notImplemented('getHousehold') },
  async createHousehold() { notImplemented('createHousehold') },
  async updateHousehold() { notImplemented('updateHousehold') },
  async deleteHousehold() { notImplemented('deleteHousehold') },
  async getHouseholdMembers() { notImplemented('getHouseholdMembers') },
  async getPersonHouseholds() { notImplemented('getPersonHouseholds') },
  async addHouseholdMember() { notImplemented('addHouseholdMember') },
  async updateHouseholdMember() { notImplemented('updateHouseholdMember') },
  async removeHouseholdMember() { notImplemented('removeHouseholdMember') },

  async getChildPickups() { notImplemented('getChildPickups') },
  async getPickupsByHousehold() { notImplemented('getPickupsByHousehold') },
  async createChildPickup() { notImplemented('createChildPickup') },
  async updateChildPickup() { notImplemented('updateChildPickup') },
  async deleteChildPickup() { notImplemented('deleteChildPickup') },

  async getCheckinSessions() { notImplemented('getCheckinSessions') },
  async getCheckinSession() { notImplemented('getCheckinSession') },
  async createCheckinSession() { notImplemented('createCheckinSession') },
  async updateCheckinSession() { notImplemented('updateCheckinSession') },

  async getCheckins() { notImplemented('getCheckins') },
  async createCheckin() { notImplemented('createCheckin') },
  async updateCheckin() { notImplemented('updateCheckin') },

  async getCheckinFlags() { notImplemented('getCheckinFlags') },
  async getCheckinFlagsForPerson() { notImplemented('getCheckinFlagsForPerson') },
  async createCheckinFlag() { notImplemented('createCheckinFlag') },
  async updateCheckinFlag() { notImplemented('updateCheckinFlag') },

  async getTeams() { notImplemented('getTeams') },
  async getTeam() { notImplemented('getTeam') },
  async createTeam() { notImplemented('createTeam') },
  async updateTeam() { notImplemented('updateTeam') },
  async getTeamMembers() { notImplemented('getTeamMembers') },
  async addTeamMember() { notImplemented('addTeamMember') },
  async removeTeamMember() { notImplemented('removeTeamMember') },
  async updateTeamMember() { notImplemented('updateTeamMember') },

  async getVolunteerSchedule() { notImplemented('getVolunteerSchedule') },
  async createVolunteerSchedule() { notImplemented('createVolunteerSchedule') },
  async updateVolunteerSchedule() { notImplemented('updateVolunteerSchedule') },
  async deleteVolunteerSchedule() { notImplemented('deleteVolunteerSchedule') },
  async getVolunteerBlackouts() { notImplemented('getVolunteerBlackouts') },
  async createVolunteerBlackout() { notImplemented('createVolunteerBlackout') },
  async deleteVolunteerBlackout() { notImplemented('deleteVolunteerBlackout') },

  async getGroups() { notImplemented('getGroups') },
  async getGroup() { notImplemented('getGroup') },
  async createGroup() { notImplemented('createGroup') },
  async updateGroup() { notImplemented('updateGroup') },
  async getGroupMembers() { notImplemented('getGroupMembers') },
  async getPersonGroups() { notImplemented('getPersonGroups') },
  async addGroupMember() { notImplemented('addGroupMember') },
  async updateGroupMember() { notImplemented('updateGroupMember') },
  async removeGroupMember() { notImplemented('removeGroupMember') },

  async getGroupMeetings() { notImplemented('getGroupMeetings') },
  async getGroupMeeting() { notImplemented('getGroupMeeting') },
  async createGroupMeeting() { notImplemented('createGroupMeeting') },
  async updateGroupMeeting() { notImplemented('updateGroupMeeting') },
  async deleteGroupMeeting() { notImplemented('deleteGroupMeeting') },
  async getGroupAttendance() { notImplemented('getGroupAttendance') },
  async upsertGroupAttendance() { notImplemented('upsertGroupAttendance') },

  async getEvents() { notImplemented('getEvents') },
  async getEvent() { notImplemented('getEvent') },
  async createEvent() { notImplemented('createEvent') },
  async updateEvent() { notImplemented('updateEvent') },
  async getEventRegistrations() { notImplemented('getEventRegistrations') },
  async getPersonEventRegistrations() { notImplemented('getPersonEventRegistrations') },
  async createEventRegistration() { notImplemented('createEventRegistration') },
  async updateEventRegistration() { notImplemented('updateEventRegistration') },

  async getGivingRecords() { notImplemented('getGivingRecords') },
  async createGivingRecord() { notImplemented('createGivingRecord') },
  async updateGivingRecord() { notImplemented('updateGivingRecord') },
  async deleteGivingRecord() { notImplemented('deleteGivingRecord') },

  async getVisitorFollowups() { notImplemented('getVisitorFollowups') },
  async createVisitorFollowup() { notImplemented('createVisitorFollowup') },
  async updateVisitorFollowup() { notImplemented('updateVisitorFollowup') },
  async getFollowupTemplates() { notImplemented('getFollowupTemplates') },

  async getAttendanceLogs() { notImplemented('getAttendanceLogs') },
  async createAttendanceLog() { notImplemented('createAttendanceLog') },

  async getAppConfig() { notImplemented('getAppConfig') },
  async updateAppConfig() { notImplemented('updateAppConfig') },

  async getCommunicationsLog() { notImplemented('getCommunicationsLog') },
  async createCommunicationsLogEntry() { notImplemented('createCommunicationsLogEntry') },

  async getAttendanceEntries() { notImplemented('getAttendanceEntries') },
  async createAttendanceEntry() { notImplemented('createAttendanceEntry') },
  async updateAttendanceEntry() { notImplemented('updateAttendanceEntry') },

  async getPickupAttempts() { notImplemented('getPickupAttempts') },
  async createPickupAttempt() { notImplemented('createPickupAttempt') },

  async getSongs() { notImplemented('getSongs') },
  async getSong() { notImplemented('getSong') },
  async createSong() { notImplemented('createSong') },
  async updateSong() { notImplemented('updateSong') },
  async deleteSong() { notImplemented('deleteSong') },

  async getServicePlans() { notImplemented('getServicePlans') },
  async getServicePlan() { notImplemented('getServicePlan') },
  async createServicePlan() { notImplemented('createServicePlan') },
  async updateServicePlan() { notImplemented('updateServicePlan') },
  async deleteServicePlan() { notImplemented('deleteServicePlan') },

  async getServicePlanItems() { notImplemented('getServicePlanItems') },
  async createServicePlanItem() { notImplemented('createServicePlanItem') },
  async updateServicePlanItem() { notImplemented('updateServicePlanItem') },
  async deleteServicePlanItem() { notImplemented('deleteServicePlanItem') },
  async reorderServicePlanItems() { notImplemented('reorderServicePlanItems') },

  async getServiceAssignments() { notImplemented('getServiceAssignments') },
  async createServiceAssignment() { notImplemented('createServiceAssignment') },
  async deleteServiceAssignment() { notImplemented('deleteServiceAssignment') },

  async getPickupQueue() { notImplemented('getPickupQueue') },
  async createPickupQueueEntry() { notImplemented('createPickupQueueEntry') },
  async clearPickupQueueEntry() { notImplemented('clearPickupQueueEntry') },

  async getMusicStandSessions() { notImplemented('getMusicStandSessions') },
  async getMusicStandSession() { notImplemented('getMusicStandSession') },
  async createMusicStandSession() { notImplemented('createMusicStandSession') },
  async updateMusicStandSession() { notImplemented('updateMusicStandSession') },

  async getAnnotations() { notImplemented('getAnnotations') },
  async createAnnotation() { notImplemented('createAnnotation') },
  async updateAnnotation() { notImplemented('updateAnnotation') },
  async deleteAnnotation() { notImplemented('deleteAnnotation') },

  async getUserPdfPreferences() { notImplemented('getUserPdfPreferences') },
  async saveUserPdfPreferences() { notImplemented('saveUserPdfPreferences') },
}
