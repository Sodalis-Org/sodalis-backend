const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const { promisify } = require('util');

const PROTO_PATH = path.join(__dirname, '../shared/labor.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const laborProto = grpc.loadPackageDefinition(packageDefinition).labor;

const client = new laborProto.LaborService(
    process.env.LABOR_GRPC_URL || 'localhost:50052',
    grpc.credentials.createInsecure(),
);

const createTask = promisify(client.CreateTask.bind(client));

module.exports = { createTask };
