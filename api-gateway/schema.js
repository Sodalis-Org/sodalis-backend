const typeDefs = `#graphql
  type User {
    id: ID!
    name: String!
    email: String!
    role: String!
    coloc_id: ID
  }

  type AuthPayload {
    token: String!
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
    coloc_id: String!
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
    invite_code: String!
  }

  type ColocWithToken {
    coloc: Coloc!
    token: String!
  }

  type Task {
    id: ID!
    title: String!
    status: String!
    assignee_id: ID!
    coloc_id: ID!
    created_at: String
  }

  type Dashboard {
    users: [User]
    tasks: [Task]
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

  type Query {
    usersByColoc(colocId: ID!): [User]
    tasksByColoc(colocId: ID!): [Task]
    getColocDashboard(colocId: ID!): Dashboard
    maintenanceTickets(colocId: ID!): [MaintenanceTicket]
    notifications(colocId: ID!, page: Int, limit: Int): NotificationsResult
  }

  type Mutation {
    register(name: String!, email: String!, password: String!): RegisterPayload
    login(email: String!, password: String!): AuthPayload
    createColoc(name: String!): ColocWithToken
    joinColoc(invite_code: String!): ColocWithToken
    createTask(title: String!, assignee_id: ID!, coloc_id: ID!): Task
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
  }
`;

module.exports = typeDefs;
