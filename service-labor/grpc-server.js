const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const pool = require('./db');
const publisher = require('./redis-publisher');
const logger = require('./logger');

const PROTO_PATH = path.join(__dirname, '../shared/labor.proto');
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});
const laborProto = grpc.loadPackageDefinition(packageDefinition).labor;

async function createTask(call, callback) {
    const { title, assignee_id, coloc_id } = call.request;
    try {
        const { rows } = await pool.query(
            'INSERT INTO tasks (title, assignee_id, coloc_id) VALUES ($1, $2, $3) RETURNING *',
            [title, assignee_id, coloc_id],
        );

        const task = rows[0];

        await publisher.publish(
            'sodalis_events',
            JSON.stringify({
                type: 'NEW_TASK',
                coloc_id,
                message: `Nouvelle tâche assignée : ${title}`,
            }),
        );

        await publisher.del(`dashboard_coloc_${coloc_id}`);

        callback(null, {
            task_id: String(task.id),
            title: task.title,
            status: task.status,
        });
    } catch (err) {
        callback(err);
    }
}

function startGrpcServer() {
    return new Promise((resolve, reject) => {
        const server = new grpc.Server();
        server.addService(laborProto.LaborService.service, { CreateTask: createTask });

        const GRPC_PORT = process.env.LABOR_GRPC_PORT || 50052;
        server.bindAsync(
            `0.0.0.0:${GRPC_PORT}`,
            grpc.ServerCredentials.createInsecure(),
            (err, port) => {
                if (err) {
                    logger.error({ err }, 'Erreur démarrage gRPC Labor');
                    return reject(err);
                }
                logger.info(`Serveur gRPC Labor → port ${port}`);
                resolve(server);
            },
        );
    });
}

module.exports = startGrpcServer;
