import { WebSocketServer } from 'ws';
import { createSocket } from 'dgram';
import fs from 'fs';


const BALANCE_ESP = {
    ip: '192.168.71.249',
    port: 8844
};

const CONTROL_ESP = {
    ip: '192.168.71.136',
    port: 4210
};

// Create UDP socket
const udpSocket = createSocket('udp4');
udpSocket.bind(5000);

// Create WebSocket server
const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
    console.log('Web client connected');

    ws.on('message', (message) => {
        const msg = message.toString();
        
        // Route messages based on prefix
        if (msg.startsWith('ESP2:')) {
            // Messages for ESP2 (Control ESP)
            udpSocket.send(msg, CONTROL_ESP.port, CONTROL_ESP.ip);
            console.log('To Control ESP:', msg);
        } else {
            // Messages for Balance ESP
            udpSocket.send(msg, BALANCE_ESP.port, BALANCE_ESP.ip);
            console.log('To Balance ESP:', msg);
        }
    });

    udpSocket.on('message', (msg) => {
        ws.send(msg.toString());
    });
});

console.log('UDP proxy running on ws://localhost:8080');
