const typeDefs = `#graphql
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    coloc_id: ID
    harmony_score: Int!
    karma_score: Int
  }

  type KarmaProfile {
    user_id: ID!
    coloc_id: ID!
    score: Int!
  }

  type RecentThank {
    to_id: ID!
    createdAt: String!
  }

  type Thank {
    id: ID!
    from_id: ID!
    to_id: ID!
    createdAt: String!
  }

  type AuthPayload {
    user: User!
  }

  type RegisterPayload {
    id: ID!
    name: String!
    email: String!
    role: String!
  }

  type Notification {
    id: ID!
    coloc_id: ID!
    type: String!
    message: String!
    created_at: String!
  }

  type NotificationPagination {
    page: Int!
    limit: Int!
    total: Int!
  }

  type NotificationsResult {
    data: [Notification!]!
    pagination: NotificationPagination!
  }

  type Coloc {
    id: ID!
    name: String!
    invite_code: String
  }

  type ColocResult {
    coloc: Coloc!
  }

  type LeaveColocResult {
    ok: Boolean!
  }

  type KickMemberResult {
    ok: Boolean!
  }

  type TransferAdminResult {
    ok: Boolean!
  }

  type Task {
    id: ID!
    title: String!
    status: String!
    assignee_id: ID!
    coloc_id: ID!
    created_at: String
    due_at: String
  }

  type Dashboard {
    users: [User]
    tasks: [Task]
    open_complaints: Int
  }

  type MaintenanceTicket {
    id: ID!
    title: String!
    description: String
    category: String!
    priority: String!
    status: String!
    created_by: ID!
    assigned_to: ID
    coloc_id: ID!
    created_at: String
    updated_at: String
  }

  type Complaint {
    id: ID!
    coloc_id: ID!
    creator_id: ID
    target_id: ID
    message: String!
    is_anonymous: Boolean!
    status: String!
    createdAt: String
  }

  type PollOption {
    option_id: ID!
    text: String!
    voters: [ID]
  }

  type Poll {
    id: ID!
    coloc_id: ID!
    creator_id: ID!
    question: String!
    options: [PollOption]
    status: String!
    createdAt: String
  }

  type Query {
    me: User
    myColoc: Coloc
    usersByColoc(colocId: ID!): [User]
    tasksByColoc(colocId: ID!): [Task]
    getColocDashboard(colocId: ID!): Dashboard
    maintenanceTickets(colocId: ID!): [MaintenanceTicket]
    notifications(colocId: ID!, page: Int, limit: Int): NotificationsResult
    complaints(colocId: ID!): [Complaint]
    polls(colocId: ID!): [Poll]
    myRecentThanks(colocId: ID!): [RecentThank]
    colocThanks(colocId: ID!): [Thank]
    unreadNotificationsCount(colocId: ID!): Int
  }

  type Mutation {
    register(name: String!, email: String!, password: String!): RegisterPayload
    login(email: String!, password: String!): AuthPayload
    logout: Boolean
    createColoc(name: String!): ColocResult
    joinColoc(invite_code: String!): ColocResult
    leaveColoc: LeaveColocResult
    regenerateInviteCode: ColocResult
    kickMember(userId: ID!): KickMemberResult
    transferAdmin(userId: ID!): TransferAdminResult
    createTask(title: String!, assignee_id: ID!, coloc_id: ID!, due_at: String): Task
    updateTaskStatus(id: ID!, status: String!): Task
    createMaintenanceTicket(
      title: String!
      description: String
      category: String!
      priority: String!
      coloc_id: ID!
    ): MaintenanceTicket
    updateTicketStatus(id: ID!, status: String!): MaintenanceTicket
    assignTicket(id: ID!, assigned_to: ID!): MaintenanceTicket
    createComplaint(coloc_id: ID!, message: String!, target_id: ID, is_anonymous: Boolean): Complaint
    resolveComplaint(id: ID!): Complaint
    deleteComplaint(id: ID!): Boolean
    createPoll(coloc_id: ID!, question: String!, options: [String!]!): Poll
    votePoll(poll_id: ID!, option_id: ID!): Poll
    closePoll(id: ID!): Poll
    thankUser(target_id: ID!): KarmaProfile
    markNotificationsRead(colocId: ID!): Boolean
  }
`;

module.exports = typeDefs;
