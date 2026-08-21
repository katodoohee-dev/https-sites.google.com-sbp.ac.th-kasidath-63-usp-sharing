import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { db } from "../db/index.js";

export const devicesRouter = Router();
const deviceSchema = z.object({
  name: z.string().max(160).optional(),
  deviceUid: z.string().max(300).optional(),
  deviceType: z.string().max(60).optional(),
  kind: z.string().max(60).optional(),
  metadata: z.record(z.unknown()).optional(),
});

function listDevices(req: any, res: any) {
  const rows = db.prepare(`SELECT id,device_name AS name,device_uid AS deviceUid,device_type AS deviceType,status,metadata_json AS metadataJson,last_seen_at AS lastSeenAt,created_at AS createdAt FROM connected_devices WHERE user_id=? ORDER BY last_seen_at DESC`).all(req.userId);
  res.json({ success: true, devices: rows.map((r:any)=>({...r, metadata:r.metadataJson?JSON.parse(r.metadataJson):{}})) });
}

function createDevice(req: any, res: any) {
  const p = deviceSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({success:false,error:p.error.issues[0]?.message});
  const d = p.data;
  const id = "d_" + crypto.randomBytes(8).toString("hex");
  const deviceType = d.deviceType ?? d.kind ?? "bluetooth";
  db.prepare(`INSERT INTO connected_devices(id,user_id,device_name,device_uid,device_type,status,metadata_json) VALUES(?,?,?,?,?, 'connected',?)`).run(id,req.userId,d.name??null,d.deviceUid??null,deviceType,JSON.stringify(d.metadata??{}));
  res.status(201).json({success:true,device:{id,name:d.name??null,deviceUid:d.deviceUid??null,deviceType,status:"connected",metadata:d.metadata??{}} ,id});
}

function disconnectDevice(req: any, res: any) {
  const row = db.prepare(`SELECT id FROM connected_devices WHERE id=? AND user_id=?`).get(req.params.id,req.userId);
  if (!row) return res.status(404).json({success:false,error:"not_found"});
  db.prepare(`UPDATE connected_devices SET status='disconnected', last_seen_at=datetime('now') WHERE id=? AND user_id=?`).run(req.params.id,req.userId);
  res.json({success:true,status:"disconnected"});
}

devicesRouter.get("/", listDevices);
devicesRouter.post("/", createDevice);

devicesRouter.post("/connect", (req,res) => createDevice(req,res));

devicesRouter.post("/:id/sync",(req,res)=>{
  const row=db.prepare(`SELECT id,status FROM connected_devices WHERE id=? AND user_id=?`).get(req.params.id,req.userId);
  if(!row)return res.status(404).json({success:false,error:"not_found"});
  db.prepare(`UPDATE connected_devices SET status='connected',last_seen_at=datetime('now') WHERE id=? AND user_id=?`).run(req.params.id,req.userId);
  res.json({success:true,syncedAt:new Date().toISOString(),status:"connected"});
});

devicesRouter.post("/:id/disconnect", disconnectDevice);
devicesRouter.delete("/:id",(req,res)=>{
  const r=db.prepare(`DELETE FROM connected_devices WHERE id=? AND user_id=?`).run(req.params.id,req.userId);
  if(!r.changes)return res.status(404).json({success:false,error:"not_found"});
  res.json({success:true});
});
