'use strict';
const express    = require('express');
const session    = require('express-session');
const bodyParser = require('body-parser');
const mongoose   = require('mongoose');
const multer     = require('multer');
const moment     = require('moment');
const bcrypt     = require('bcryptjs');
const path       = require('path');
const fs         = require('fs');

if (!process.env.MONGODB_URI) {
  console.error('❌  MONGODB_URI is not set. Add it in Render.com → Environment Variables');
  process.exit(1);
}

const app  = express();
const PORT = process.env.PORT || 3000;
const SALT = 10;

// ── DIRS ────────────────────────────────
const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── MIDDLEWARE ──────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dcs_enterprise_2025_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 } // 8 hours
}));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ── MULTER ──────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename:    (req, file, cb) => cb(null, Date.now() + '-' + path.extname(file.originalname).toLowerCase())
});
const fileFilter = (req, file, cb) =>
  cb(null, /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|dwg|zip|ppt|pptx)$/i.test(path.extname(file.originalname)));
const upload     = multer({ storage, fileFilter, limits: { fileSize: 25 * 1024 * 1024 } });
const uploadDocs = upload.array('attachments', 20);
const uploadSingle = upload.single('logo');

// ── MONGOOSE MODELS ──────────────────────
const { Schema, model, Types } = mongoose;

// Settings / Branding
const SettingsSchema = new Schema({
  project_name:     { type: String, default: 'Construction Project' },
  project_number:   { type: String, default: '' },
  contract_number:  { type: String, default: '' },
  company_name:     { type: String, default: 'My Company' },
  client_name:      { type: String, default: '' },
  consultant_name:  { type: String, default: '' },
  contractor_name:  { type: String, default: '' },
  company_logo:     { type: String, default: '' },
  client_logo:      { type: String, default: '' },
  consultant_logo:  { type: String, default: '' },
  contractor_logo:  { type: String, default: '' },
  project_logo:     { type: String, default: '' },
  primary_color:    { type: String, default: '#1a7a7a' },
  accent_color:     { type: String, default: '#23a6a6' },
  prepared_by:      { type: String, default: 'Document Controller' },
  updated_at:       { type: Date, default: Date.now }
});
const Settings = model('Settings', SettingsSchema);

// User — hashed passwords, roles
const UserSchema = new Schema({
  full_name:    { type: String, required: true },
  username:     { type: String, unique: true, sparse: true },
  email:        { type: String, required: true, unique: true },
  password:     { type: String, required: true },
  role:         { type: String, enum: ['super_admin','admin','document_controller','reviewer','viewer'], required: true },
  company:      String,
  phone:        String,
  department:   String,
  is_active:    { type: Boolean, default: true },
  last_login:   Date,
  created_at:   { type: Date, default: Date.now }
});
// Hash password before save
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, SALT);
  next();
});
UserSchema.methods.comparePassword = function(plain) {
  return bcrypt.compare(plain, this.password);
};
const User = model('User', UserSchema);

// Document
const DocumentSchema = new Schema({
  doc_number:     { type: String, required: true, unique: true },
  type:           { type: String, required: true },
  title:          { type: String, required: true },
  rev:            { type: String, default: 'A' },
  status:         { type: String, default: 'Open' },
  discipline:     String,
  sub_discipline: String,
  area:           String,
  zone:           String,
  package:        String,
  originator:     String,
  reviewer:       String,
  approver:       String,
  contractor:     String,
  consultant:     String,
  submitted_by:   String,
  issue_date:     Date,
  due_date:       Date,
  response_date:  Date,
  days_open:      { type: Number, default: 0 },
  priority:       { type: String, enum: ['Low','Normal','High','Critical'], default: 'Normal' },
  remarks:        String,
  attachments:    [String],
  tags:           [String],
  created_by:     { type: Types.ObjectId, ref: 'User' },
  updated_by:     { type: Types.ObjectId, ref: 'User' },
  updated_at:     { type: Date, default: Date.now },
  created_at:     { type: Date, default: Date.now }
});
// Index for search performance
DocumentSchema.index({ doc_number: 'text', title: 'text', remarks: 'text' });
DocumentSchema.index({ type: 1, discipline: 1, status: 1, updated_at: -1 });
const Document = model('Document', DocumentSchema);

// Transmittal
const TransmittalSchema = new Schema({
  transmittal_no: { type: String, required: true, unique: true },
  title:          String,
  issued_to:      String,
  issued_by:      { type: Types.ObjectId, ref: 'User' },
  documents:      [{ type: Types.ObjectId, ref: 'Document' }],
  remarks:        String,
  status:         { type: String, enum: ['Draft','Issued','Acknowledged'], default: 'Draft' },
  created_at:     { type: Date, default: Date.now }
});
const Transmittal = model('Transmittal', TransmittalSchema);

// Revision Log
const RevisionSchema = new Schema({
  document_id: { type: Types.ObjectId, ref: 'Document', required: true },
  rev:         { type: String, required: true },
  changed_by:  { type: Types.ObjectId, ref: 'User' },
  change_note: String,
  changed_at:  { type: Date, default: Date.now }
});
const Revision = model('Revision', RevisionSchema);

// Notification
const NotificationSchema = new Schema({
  message:    String,
  type:       { type: String, default: 'all' },
  created_by: { type: Types.ObjectId, ref: 'User' },
  created_at: { type: Date, default: Date.now }
});
const Notification = model('Notification', NotificationSchema);

// Leave
const LeaveSchema = new Schema({
  user_id:    { type: Types.ObjectId, ref: 'User', required: true },
  role: String, date: String, message: String,
  status:     { type: String, default: 'Pending' },
  created_at: { type: Date, default: Date.now }
});
const Leave = model('Leave', LeaveSchema);

// Feedback
const FeedbackSchema = new Schema({
  user_id:    { type: Types.ObjectId, ref: 'User' },
  message:    String,
  created_at: { type: Date, default: Date.now }
});
const Feedback = model('Feedback', FeedbackSchema);

// ── HELPERS ──────────────────────────────
function calcDaysOpen(issue_date, response_date) {
  if (!issue_date) return 0;
  return Math.max(0, moment(response_date || new Date()).diff(moment(issue_date), 'days'));
}
async function generateDocNumber(type, discipline) {
  const t = (type || 'DOC').toUpperCase();
  const d = (discipline || 'GEN').toUpperCase().slice(0,4);
  const count = await Document.countDocuments({ type: t, discipline: { $regex: new RegExp('^'+d, 'i') } });
  return `${t}-${d}-${String(count + 1).padStart(3, '0')}`;
}
async function generateTransmittalNumber() {
  const year  = new Date().getFullYear();
  const count = await Transmittal.countDocuments();
  return `TRN-${year}-${String(count + 1).padStart(4, '0')}`;
}
async function getSettings() {
  let s = await Settings.findOne();
  if (!s) s = await Settings.create({});
  return s;
}

// ── INIT SUPER ADMIN ──────────────────────
async function initAdmin() {
  const exists = await User.findOne({ role: 'super_admin' });
  if (!exists) {
    const u = new User({
      full_name: 'Super Administrator',
      email:     'admin@dcs.com',
      username:  'admin',
      password:  'Admin@2025',
      role:      'super_admin'
    });
    await u.save();
    console.log('✅ Super Admin created — login: admin@dcs.com / Admin@2025');
  }
  console.log('✅ MongoDB connected');
}

// ── AUTH MIDDLEWARE ───────────────────────
function requireAuth(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.session.user || !roles.includes(req.session.user.role))
      return res.redirect('/app?page=dashboard&msg=' + encodeURIComponent('Access denied.'));
    next();
  };
}
const ADMIN_ROLES = ['super_admin','admin'];
const EDITOR_ROLES = ['super_admin','admin','document_controller'];

// ── ROUTES ───────────────────────────────
app.get('/', (req, res) => res.redirect('/app'));

app.get('/login', (req, res) => {
  if (req.session.user) return res.redirect('/app');
  res.render('login', { error: req.query.error || null });
});

app.post('/login', async (req, res) => {
  try {
    const { identifier, password } = req.body;
    if (!identifier || !password)
      return res.redirect('/login?error=' + encodeURIComponent('Please enter your credentials.'));
    const id = identifier.trim().toLowerCase();
    const user = await User.findOne({ $or: [{ email: id }, { username: id }], is_active: true });
    if (!user) return res.redirect('/login?error=' + encodeURIComponent('Invalid credentials. Please try again.'));
    const match = await user.comparePassword(password);
    if (!match) return res.redirect('/login?error=' + encodeURIComponent('Invalid credentials. Please try again.'));
    await User.findByIdAndUpdate(user._id, { last_login: new Date() });
    req.session.user = { _id: user._id, full_name: user.full_name, email: user.email, role: user.role, company: user.company || '' };
    res.redirect('/app?page=dashboard');
  } catch (err) {
    console.error(err);
    res.redirect('/login?error=' + encodeURIComponent('Server error. Please try again.'));
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/login'));
});

// ── LOGO UPLOAD ───────────────────────────
app.post('/upload-logo', requireAuth, requireRole(...ADMIN_ROLES), (req, res) => {
  uploadSingle(req, res, async (err) => {
    if (err || !req.file) return res.json({ error: err ? err.message : 'No file' });
    const field = req.body.field || 'company_logo';
    const allowed = ['company_logo','client_logo','consultant_logo','contractor_logo','project_logo'];
    if (!allowed.includes(field)) return res.json({ error: 'Invalid field' });
    await Settings.updateOne({}, { $set: { [field]: req.file.filename, updated_at: new Date() } }, { upsert: true });
    res.json({ filename: req.file.filename, ok: true });
  });
});

// ── JSON IMPORT ───────────────────────────
app.post('/import-json', requireAuth, requireRole(...EDITOR_ROLES),
  express.json({ limit: '50mb' }),
  async (req, res) => {
    try {
      const raw = Array.isArray(req.body) ? req.body : req.body.data;
      if (!raw || !Array.isArray(raw)) return res.json({ error: 'Expected JSON array' });
      let colMap = null, imported = 0, skipped = 0;
      const errors = [];
      for (const row of raw) {
        const vals = Object.values(row).map(v => String(v || '').replace('▼','').trim());
        if (!colMap && vals.some(v => /DOC.?NUMBER|^TYPE$/i.test(v))) {
          colMap = {};
          Object.keys(row).forEach(k => {
            const v = String(row[k]||'').replace('▼','').trim().toUpperCase();
            if (/^NO\.?$/.test(v))              colMap.no = k;
            if (v.includes('DOC NUMBER'))        colMap.doc_number = k;
            if (v === 'TYPE')                    colMap.type = k;
            if (v.includes('TITLE'))             colMap.title = k;
            if (v === 'REV')                     colMap.rev = k;
            if (v === 'STATUS')                  colMap.status = k;
            if (/^DISC(IPLINE)?$/.test(v))       colMap.discipline = k;
            if (v.includes('AREA'))              colMap.area = k;
            if (v.includes('ZONE'))              colMap.zone = k;
            if (v.includes('PACKAGE'))           colMap.package = k;
            if (v === 'CONTRACTOR')              colMap.contractor = k;
            if (v === 'CONSULTANT')              colMap.consultant = k;
            if (v.includes('SUBMITTED BY')||v==='ORIGINATOR') colMap.submitted_by = k;
            if (v.includes('REVIEWER'))          colMap.reviewer = k;
            if (v.includes('APPROVER'))          colMap.approver = k;
            if (v.includes('ISSUE DATE'))        colMap.issue_date = k;
            if (v.includes('DUE DATE'))          colMap.due_date = k;
            if (v.includes('RESPONSE DATE'))     colMap.response_date = k;
            if (v.includes('DAYS'))              colMap.days_open = k;
            if (v.includes('PRIORITY'))          colMap.priority = k;
            if (v.includes('REMARKS'))           colMap.remarks = k;
          });
          continue;
        }
        if (!colMap) continue;
        const no = row[colMap.no||''];
        if (!no || isNaN(Number(no))) { skipped++; continue; }
        const type = String(row[colMap.type||'']||'').trim();
        if (!type || type.toUpperCase() === 'TYPE') { skipped++; continue; }
        const doc_number = String(row[colMap.doc_number||'']||'').trim();
        if (!doc_number) { skipped++; continue; }
        try {
          const issue_date    = row[colMap.issue_date]    ? new Date(row[colMap.issue_date])    : null;
          const due_date      = row[colMap.due_date]      ? new Date(row[colMap.due_date])      : null;
          const response_date = row[colMap.response_date] ? new Date(row[colMap.response_date]) : null;
          const g = f => String(row[colMap[f]||'']||'').trim();
          await Document.updateOne({ doc_number }, { $set: {
            doc_number, type, title: g('title'), rev: g('rev')||'A',
            status: g('status')||'Open', discipline: g('discipline'),
            area: g('area'), zone: g('zone'), package: g('package'),
            contractor: g('contractor'), consultant: g('consultant'),
            submitted_by: g('submitted_by'), reviewer: g('reviewer'), approver: g('approver'),
            issue_date, due_date, response_date,
            days_open: calcDaysOpen(issue_date, response_date),
            priority: g('priority')||'Normal', remarks: g('remarks'), updated_at: new Date()
          }}, { upsert: true });
          imported++;
        } catch(e) { errors.push(`${doc_number}: ${e.message}`); skipped++; }
      }
      res.json({ imported, skipped, errors });
    } catch(err) { res.status(500).json({ error: err.message }); }
  }
);

// ── API STATS ────────────────────────────
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const today = new Date();
    const startOfDay   = moment().startOf('day').toDate();
    const startOfWeek  = moment().startOf('week').toDate();
    const startOfMonth = moment().startOf('month').toDate();
    const [total, transmittals, overdue, submittedToday, submittedWeek, submittedMonth,
           approved, rejected, pending, closed, active, statusAgg, typeAgg, discAgg, typeDiscAgg] = await Promise.all([
      Document.countDocuments(),
      Transmittal.countDocuments(),
      Document.countDocuments({ due_date: { $lt: today }, status: { $nin: ['Approved','Closed','Cancelled'] } }),
      Document.countDocuments({ created_at: { $gte: startOfDay } }),
      Document.countDocuments({ created_at: { $gte: startOfWeek } }),
      Document.countDocuments({ created_at: { $gte: startOfMonth } }),
      Document.countDocuments({ status: 'Approved' }),
      Document.countDocuments({ status: 'Rejected' }),
      Document.countDocuments({ status: { $in: ['Pending','Open','Under Review'] } }),
      Document.countDocuments({ status: { $in: ['Closed','Cancelled'] } }),
      Document.countDocuments({ status: { $nin: ['Closed','Cancelled','Approved'] } }),
      Document.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      Document.aggregate([{ $group: { _id: '$type',   count: { $sum: 1 } } }]),
      Document.aggregate([{ $group: { _id: '$discipline', count: { $sum: 1 } } }]),
      Document.aggregate([{ $group: { _id: { type: '$type', discipline: '$discipline', status: '$status' }, count: { $sum: 1 } } }])
    ]);
    const by_status = {}, by_type = {}, by_discipline = {};
    statusAgg.forEach(s => { by_status[s._id] = s.count; });
    typeAgg.forEach(t => { by_type[t._id] = t.count; });
    discAgg.forEach(d => { by_discipline[d._id] = d.count; });
    // Build type × discipline × status matrix
    const matrix = {};
    typeDiscAgg.forEach(r => {
      const { type, discipline, status } = r._id;
      if (!type) return;
      if (!matrix[type]) matrix[type] = {};
      const disc = discipline || 'Unspecified';
      if (!matrix[type][disc]) matrix[type][disc] = {};
      matrix[type][disc][status] = r.count;
    });
    // Monthly trend (last 12 months)
    const monthlyAgg = await Document.aggregate([
      { $match: { created_at: { $gte: moment().subtract(12,'months').toDate() } } },
      { $group: { _id: { year: { $year: '$created_at' }, month: { $month: '$created_at' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);
    const approval_rate = total ? Math.round(approved/total*100) : 0;
    res.json({ total, transmittals, overdue, submittedToday, submittedWeek, submittedMonth,
      approved, rejected, pending, closed, active, approval_rate,
      by_status, by_type, by_discipline, matrix, monthly: monthlyAgg });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── APP HANDLER ───────────────────────────
async function appHandler(req, res) {
  try {
    const page        = req.query.page || 'dashboard';
    const user        = req.session.user;
    let   success_msg = req.query.msg ? decodeURIComponent(req.query.msg) : null;
    const settings    = await getSettings();

    // DELETE via GET
    if (req.query.delete && req.query.table && req.query.id) {
      const { table, id } = req.query;
      if (table === 'documents')          await Document.findByIdAndDelete(id);
      else if (table === 'transmittals')  await Transmittal.findByIdAndDelete(id);
      else if (table === 'notifications') await Notification.findByIdAndDelete(id);
      else if (table === 'users') {
        if (id === String(user._id))
          return res.redirect(`/app?page=${req.query.page}&msg=${encodeURIComponent('Cannot delete your own account.')}`);
        await User.findByIdAndDelete(id);
      }
      return res.redirect(`/app?page=${req.query.page}&msg=${encodeURIComponent('Record deleted successfully.')}`);
    }

    // POST ACTIONS
    if (req.method === 'POST') {
      const a = req.body.action;

      if (a === 'add_document') {
        let doc_number = (req.body.doc_number||'').trim();
        if (!doc_number) doc_number = await generateDocNumber(req.body.type, req.body.discipline);
        const issue = req.body.issue_date    ? new Date(req.body.issue_date)    : null;
        const due   = req.body.due_date      ? new Date(req.body.due_date)      : null;
        const resp  = req.body.response_date ? new Date(req.body.response_date) : null;
        const files = req.files ? req.files.map(f => f.filename) : [];
        const doc   = await Document.create({
          doc_number, type: req.body.type, title: req.body.title,
          rev: req.body.rev||'A', status: req.body.status||'Open',
          discipline: req.body.discipline, area: req.body.area, zone: req.body.zone,
          package: req.body.package, contractor: req.body.contractor,
          consultant: req.body.consultant, submitted_by: req.body.submitted_by,
          reviewer: req.body.reviewer, approver: req.body.approver,
          issue_date: issue, due_date: due, response_date: resp,
          days_open: calcDaysOpen(issue, resp), priority: req.body.priority||'Normal',
          remarks: req.body.remarks, attachments: files,
          created_by: user._id, updated_by: user._id, updated_at: new Date()
        });
        await Revision.create({ document_id: doc._id, rev: doc.rev, changed_by: user._id, change_note: 'Initial submission' });
        success_msg = 'Document added successfully.';
      }
      else if (a === 'update_document') {
        const old   = await Document.findById(req.body.id);
        const issue = req.body.issue_date    ? new Date(req.body.issue_date)    : null;
        const due   = req.body.due_date      ? new Date(req.body.due_date)      : null;
        const resp  = req.body.response_date ? new Date(req.body.response_date) : null;
        const files = req.files ? req.files.map(f => f.filename) : [];
        await Document.findByIdAndUpdate(req.body.id, {
          type: req.body.type, title: req.body.title, rev: req.body.rev,
          status: req.body.status, discipline: req.body.discipline, area: req.body.area,
          zone: req.body.zone, package: req.body.package, contractor: req.body.contractor,
          consultant: req.body.consultant, submitted_by: req.body.submitted_by,
          reviewer: req.body.reviewer, approver: req.body.approver,
          issue_date: issue, due_date: due, response_date: resp,
          days_open: calcDaysOpen(issue, resp), priority: req.body.priority||'Normal',
          remarks: req.body.remarks, attachments: [...(old?.attachments||[]), ...files],
          updated_by: user._id, updated_at: new Date()
        });
        if (old && old.rev !== req.body.rev)
          await Revision.create({ document_id: req.body.id, rev: req.body.rev, changed_by: user._id, change_note: req.body.change_note||'Revision update' });
        success_msg = 'Document updated successfully.';
      }
      else if (a === 'update_status') {
        const resp = req.body.response_date ? new Date(req.body.response_date) : null;
        const doc  = await Document.findById(req.body.id);
        await Document.findByIdAndUpdate(req.body.id, {
          status: req.body.status, response_date: resp, remarks: req.body.remarks,
          days_open: calcDaysOpen(doc?.issue_date, resp), updated_by: user._id, updated_at: new Date()
        });
        success_msg = 'Status updated.';
      }
      else if (a === 'add_user') {
        if (!ADMIN_ROLES.includes(user.role)) return res.redirect('/app?page=manage_users&msg=' + encodeURIComponent('Access denied.'));
        const u = new User({
          full_name: req.body.full_name, email: req.body.email.trim().toLowerCase(),
          username: req.body.username ? req.body.username.trim().toLowerCase() : undefined,
          password: req.body.password || 'Welcome@123',
          role: req.body.role, company: req.body.company, phone: req.body.phone,
          department: req.body.department
        });
        await u.save();
        success_msg = 'User added. Default password: ' + (req.body.password || 'Welcome@123');
      }
      else if (a === 'update_user') {
        if (!ADMIN_ROLES.includes(user.role)) return res.redirect('/app?page=manage_users&msg=' + encodeURIComponent('Access denied.'));
        await User.findByIdAndUpdate(req.body.id, {
          full_name: req.body.full_name, email: req.body.email.trim().toLowerCase(),
          username: req.body.username ? req.body.username.trim().toLowerCase() : undefined,
          company: req.body.company, phone: req.body.phone, department: req.body.department,
          role: req.body.role, is_active: req.body.is_active === 'true'
        });
        success_msg = 'User updated.';
      }
      else if (a === 'reset_user_password') {
        if (!ADMIN_ROLES.includes(user.role)) return res.redirect('/app?page=manage_users&msg=' + encodeURIComponent('Access denied.'));
        const newPass = req.body.new_password || 'Welcome@123';
        const hashed  = await bcrypt.hash(newPass, SALT);
        await User.findByIdAndUpdate(req.body.user_id, { password: hashed });
        success_msg = `Password reset to: ${newPass}`;
      }
      else if (a === 'change_password') {
        const dbUser = await User.findById(user._id);
        const match  = await dbUser.comparePassword(req.body.current_password);
        if (!match)  return res.redirect('/app?page=settings&msg=' + encodeURIComponent('Current password is incorrect.'));
        if (req.body.new_password !== req.body.confirm_password)
          return res.redirect('/app?page=settings&msg=' + encodeURIComponent('New passwords do not match.'));
        if ((req.body.new_password||'').length < 8)
          return res.redirect('/app?page=settings&msg=' + encodeURIComponent('Password must be at least 8 characters.'));
        const hashed = await bcrypt.hash(req.body.new_password, SALT);
        await User.findByIdAndUpdate(user._id, { password: hashed });
        req.session.destroy(() => res.redirect('/login?error=' + encodeURIComponent('Password changed. Please log in again.')));
        return;
      }
      else if (a === 'change_username') {
        const exists = await User.findOne({ $or: [{ email: req.body.new_identifier }, { username: req.body.new_identifier }], _id: { $ne: user._id } });
        if (exists) return res.redirect('/app?page=settings&msg=' + encodeURIComponent('Email or username already in use.'));
        const isEmail = req.body.new_identifier.includes('@');
        await User.findByIdAndUpdate(user._id, isEmail ? { email: req.body.new_identifier } : { username: req.body.new_identifier });
        req.session.destroy(() => res.redirect('/login?error=' + encodeURIComponent('Credentials updated. Please log in again.')));
        return;
      }
      else if (a === 'save_settings') {
        await Settings.updateOne({}, { $set: {
          project_name:    req.body.project_name,
          project_number:  req.body.project_number,
          contract_number: req.body.contract_number,
          company_name:    req.body.company_name,
          client_name:     req.body.client_name,
          consultant_name: req.body.consultant_name,
          contractor_name: req.body.contractor_name,
          primary_color:   req.body.primary_color || '#1a7a7a',
          accent_color:    req.body.accent_color  || '#23a6a6',
          prepared_by:     req.body.prepared_by,
          updated_at:      new Date()
        }}, { upsert: true });
        success_msg = 'Settings saved successfully.';
      }
      else if (a === 'create_transmittal') {
        const transmittal_no = await generateTransmittalNumber();
        const doc_ids = req.body.document_ids
          ? (Array.isArray(req.body.document_ids) ? req.body.document_ids : [req.body.document_ids]) : [];
        await Transmittal.create({ transmittal_no, title: req.body.title, issued_to: req.body.issued_to, issued_by: user._id, documents: doc_ids, remarks: req.body.remarks });
        success_msg = 'Transmittal created.';
      }
      else if (a === 'issue_transmittal')       { await Transmittal.findByIdAndUpdate(req.body.id, { status: 'Issued' });       success_msg = 'Transmittal issued.'; }
      else if (a === 'acknowledge_transmittal') { await Transmittal.findByIdAndUpdate(req.body.id, { status: 'Acknowledged' }); success_msg = 'Transmittal acknowledged.'; }
      else if (a === 'send_notification')       { await Notification.create({ message: req.body.message, type: req.body.type, created_by: user._id }); success_msg = 'Notification sent.'; }
      else if (a === 'apply_leave')             { await Leave.create({ user_id: user._id, role: user.role, date: req.body.date, message: req.body.message }); success_msg = 'Leave request submitted.'; }
      else if (a === 'update_leave')            { await Leave.findByIdAndUpdate(req.body.leave_id, { status: req.body.status }); success_msg = 'Leave updated.'; }
      else if (a === 'send_feedback')           { await Feedback.create({ user_id: user._id, message: req.body.message }); success_msg = 'Feedback submitted.'; }

      return res.redirect(`/app?page=${page}&msg=${encodeURIComponent(success_msg||'Done.')}`);
    }

    // GET — build data object
    const data = {
      user, page, success_msg, settings,
      documents:[], transmittals:[], users:[], notifications:[],
      notifs:[], leaves:[], feedbacks:[], revisions:[], my_leaves:[],
      overdue_docs:[], doc:null,
      f_type:req.query.type||'', f_discipline:req.query.discipline||'',
      f_status:req.query.status||'', f_contractor:req.query.contractor||'',
      f_area:req.query.area||'', f_search:req.query.search||'',
      f_date_from:req.query.date_from||'', f_date_to:req.query.date_to||'',
      f_priority:req.query.priority||'',
      total_documents:0, total_transmittals:0, total_users:0,
      overdue_count:0, approved_count:0, rejected_count:0,
      review_count:0, rr_count:0, approval_rate:0, active_count:0,
      submitted_today:0, submitted_week:0, submitted_month:0,
      by_status:{}, by_type:{}, by_discipline:{}, matrix:{},
      recent_docs:[], recent_transmittals:[]
    };

    // Always populate filter dropdowns from live DB
    [data.doc_types, data.disciplines, data.statuses, data.contractors, data.areas, data.zones, data.packages, data.reviewers, data.approvers] = await Promise.all([
      Document.distinct('type'), Document.distinct('discipline'), Document.distinct('status'),
      Document.distinct('contractor'), Document.distinct('area'), Document.distinct('zone'),
      Document.distinct('package'), Document.distinct('reviewer'), Document.distinct('approver')
    ]);
    // Clean empty values
    ['doc_types','disciplines','statuses','contractors','areas','zones','packages','reviewers','approvers']
      .forEach(k => { data[k] = (data[k]||[]).filter(Boolean).sort(); });

    if (page === 'dashboard') {
      const today = new Date();
      const [sA,tA,dA,tDA] = await Promise.all([
        Document.aggregate([{$group:{_id:'$status',count:{$sum:1}}}]),
        Document.aggregate([{$group:{_id:'$type',count:{$sum:1}}}]),
        Document.aggregate([{$group:{_id:'$discipline',count:{$sum:1}}}]),
        Document.aggregate([{$group:{_id:{type:'$type',discipline:'$discipline',status:'$status'},count:{$sum:1}}}])
      ]);
      sA.forEach(s=>{data.by_status[s._id]=s.count;}); tA.forEach(t=>{data.by_type[t._id]=t.count;}); dA.forEach(d=>{data.by_discipline[d._id]=d.count;});
      tDA.forEach(r=>{const{type,discipline,status}=r._id;if(!type)return;if(!data.matrix[type])data.matrix[type]={};const disc=discipline||'Unspecified';if(!data.matrix[type][disc])data.matrix[type][disc]={};data.matrix[type][disc][status]=r.count;});
      [data.total_documents,data.total_transmittals,data.total_users,data.overdue_count,
       data.approved_count,data.rejected_count,data.review_count,data.rr_count,
       data.submitted_today,data.submitted_week,data.submitted_month,data.active_count] = await Promise.all([
        Document.countDocuments(),Transmittal.countDocuments(),User.countDocuments(),
        Document.countDocuments({due_date:{$lt:today},status:{$nin:['Approved','Closed','Cancelled']}}),
        Document.countDocuments({status:'Approved'}),Document.countDocuments({status:'Rejected'}),
        Document.countDocuments({status:'Under Review'}),Document.countDocuments({status:'Revise & Resubmit'}),
        Document.countDocuments({created_at:{$gte:moment().startOf('day').toDate()}}),
        Document.countDocuments({created_at:{$gte:moment().startOf('week').toDate()}}),
        Document.countDocuments({created_at:{$gte:moment().startOf('month').toDate()}}),
        Document.countDocuments({status:{$nin:['Closed','Cancelled','Approved']}})
      ]);
      data.approval_rate=data.total_documents?Math.round(data.approved_count/data.total_documents*100):0;
      data.recent_docs=await Document.find().sort({updated_at:-1}).limit(10);
      data.recent_transmittals=await Transmittal.find().sort({created_at:-1}).limit(5).populate('issued_by');
    }
    else if (page==='document_register'||page==='my_submissions') {
      const filter={};
      if (page==='my_submissions'&&user.role==='contractor') filter.contractor=user.company;
      if (req.query.type)       filter.type=req.query.type;
      if (req.query.discipline) filter.discipline=req.query.discipline;
      if (req.query.status)     filter.status=req.query.status;
      if (req.query.contractor&&page!=='my_submissions') filter.contractor=req.query.contractor;
      if (req.query.area)       filter.area=req.query.area;
      if (req.query.priority)   filter.priority=req.query.priority;
      if (req.query.date_from||req.query.date_to) {
        filter.issue_date={};
        if (req.query.date_from) filter.issue_date.$gte=new Date(req.query.date_from);
        if (req.query.date_to)   filter.issue_date.$lte=new Date(req.query.date_to);
      }
      if (req.query.search) filter.$or=[
        {doc_number:new RegExp(req.query.search,'i')},
        {title:new RegExp(req.query.search,'i')},
        {contractor:new RegExp(req.query.search,'i')},
        {submitted_by:new RegExp(req.query.search,'i')}
      ];
      data.documents=await Document.find(filter).sort({updated_at:-1}).limit(500);
    }
    else if (page==='edit_document') { if (req.query.id) data.doc=await Document.findById(req.query.id); }
    else if (page==='transmittals')  { data.transmittals=await Transmittal.find().populate('issued_by documents').sort({created_at:-1}); }
    else if (page==='create_transmittal') { data.documents=await Document.find({status:{$nin:['Approved','Closed']}}).sort({updated_at:-1}); }
    else if (page==='revisions')    { data.revisions=await Revision.find().populate('document_id changed_by').sort({changed_at:-1}).limit(100); }
    else if (page==='manage_users') { data.users=await User.find().sort({role:1,full_name:1}); }
    else if (page==='notifications') { data.notifications=await Notification.find().sort({created_at:-1}); data.leaves=await Leave.find().populate('user_id').sort({created_at:-1}); }
    else if (page==='my_notifications') { data.notifs=await Notification.find({type:{$in:[user.role,'all']}}).sort({created_at:-1}); }
    else if (page==='apply_leave')  { data.my_leaves=await Leave.find({user_id:user._id}).sort({created_at:-1}); }
    else if (page==='reports') {
      const today=new Date();
      const [sA,tA,dA] = await Promise.all([
        Document.aggregate([{$group:{_id:'$status',count:{$sum:1}}}]),
        Document.aggregate([{$group:{_id:'$type',count:{$sum:1}}}]),
        Document.aggregate([{$group:{_id:'$discipline',count:{$sum:1}}}])
      ]);
      sA.forEach(s=>{data.by_status[s._id]=s.count;}); tA.forEach(t=>{data.by_type[t._id]=t.count;}); dA.forEach(d=>{data.by_discipline[d._id]=d.count;});
      [data.total_documents,data.total_transmittals,data.overdue_count,
       data.approved_count,data.rejected_count,data.review_count,data.rr_count] = await Promise.all([
        Document.countDocuments(),Transmittal.countDocuments(),
        Document.countDocuments({due_date:{$lt:today},status:{$nin:['Approved','Closed','Cancelled']}}),
        Document.countDocuments({status:'Approved'}),Document.countDocuments({status:'Rejected'}),
        Document.countDocuments({status:'Under Review'}),Document.countDocuments({status:'Revise & Resubmit'})
      ]);
      data.approval_rate=data.total_documents?Math.round(data.approved_count/data.total_documents*100):0;
      data.overdue_docs=await Document.find({due_date:{$lt:today},status:{$nin:['Approved','Closed','Cancelled']}}).sort({days_open:-1});
      data.documents=await Document.find().sort({updated_at:-1});
      // Type × Discipline matrix for reports
      const tDA=await Document.aggregate([{$group:{_id:{type:'$type',discipline:'$discipline',status:'$status'},count:{$sum:1}}}]);
      tDA.forEach(r=>{const{type,discipline,status}=r._id;if(!type)return;if(!data.matrix[type])data.matrix[type]={};const disc=discipline||'Unspecified';if(!data.matrix[type][disc])data.matrix[type][disc]={};data.matrix[type][disc][status]=r.count;});
    }
    else if (page==='feedback') {
      data.feedbacks=EDITOR_ROLES.includes(user.role)
        ?await Feedback.find().populate('user_id').sort({created_at:-1})
        :await Feedback.find({user_id:user._id}).populate('user_id').sort({created_at:-1});
    }
    else if (page==='settings') { data.users=await User.find().sort({role:1,full_name:1}); }

    res.render('app', data);
  } catch(err) {
    console.error('appHandler error:', err);
    res.status(500).send('<h2>Error: '+err.message+'</h2><a href="/app">Back</a>');
  }
}

app.get('/app',  requireAuth, appHandler);
app.post('/app', requireAuth, (req,res,next) => { uploadDocs(req,res,err=>{ if(err) console.error('Upload:',err); next(); }); }, appHandler);
app.use((req,res) => res.status(404).send('Not found: '+req.method+' '+req.url));

// ── CONNECT ──────────────────────────────
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => { await initAdmin(); app.listen(PORT,'0.0.0.0',()=>console.log(`🚀 DCS Enterprise v2 on port ${PORT}`)); })
  .catch(err => { console.error('❌ MongoDB failed:',err.message); process.exit(1); });
