import { Router } from "express";
import { z } from "zod";
import { db } from "../db/index.js";
export const soundRouter=Router();
const schema=z.object({volume:z.number().int().min(0).max(100).optional(),mode:z.string().max(40).optional(),voiceEnabled:z.boolean().optional(),outputDevice:z.string().max(160).nullable().optional(),inputDevice:z.string().max(160).nullable().optional()});
function read(userId:string){const r=db.prepare(`SELECT volume,mode,voice_enabled AS voiceEnabled,output_device AS outputDevice,input_device AS inputDevice,updated_at AS updatedAt FROM sound_sessions WHERE user_id=?`).get(userId) as any;return r??{volume:68,mode:"Ambient",voiceEnabled:true,outputDevice:null,inputDevice:null};}
soundRouter.get("/",(req,res)=>res.json({success:true,settings:read(req.userId)}));
soundRouter.put("/",(req,res)=>{const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({success:false,error:p.error.issues[0]?.message});const current=read(req.userId);const d={...current,...p.data};db.prepare(`INSERT INTO sound_sessions(user_id,volume,mode,voice_enabled,output_device,input_device,updated_at) VALUES(?,?,?,?,?,?,datetime('now')) ON CONFLICT(user_id) DO UPDATE SET volume=excluded.volume,mode=excluded.mode,voice_enabled=excluded.voice_enabled,output_device=excluded.output_device,input_device=excluded.input_device,updated_at=datetime('now')`).run(req.userId,d.volume,d.mode,d.voiceEnabled?1:0,d.outputDevice,d.inputDevice);res.json({success:true,settings:read(req.userId)});});
