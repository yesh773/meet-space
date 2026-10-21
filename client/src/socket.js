import { io } from 'socket.io-client';
import { API_URL } from './api.js';

// One shared socket for the whole app. We connect manually when entering a room.
const socket = io(API_URL, { autoConnect: false });
export default socket;
