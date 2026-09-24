import json, os, re, subprocess, sys, time
from datetime import datetime, timezone
from pathlib import Path

KEEP_EMAIL = (sys.argv[1] if len(sys.argv) > 1 else "serayamg@gmail.com").strip().lower()
if KEEP_EMAIL != "serayamg@gmail.com":
    raise RuntimeError("KEEP_EMAIL_MISMATCH")

def wr(args, retries=5):
    last = None
    for attempt in range(retries):
        p = subprocess.run(["npx","wrangler",*args], text=True, env=os.environ, capture_output=True)
        if p.returncode == 0:
            return p.stdout
        last = p
        time.sleep(2 + attempt * 2)
    print((last.stdout if last else "")[-4000:])
    print((last.stderr if last else "")[-4000:])
    raise RuntimeError("WRANGLER_COMMAND_FAILED")

dbs = json.loads(wr(["d1","list","--json"]))
db = next((x for x in dbs if re.search(r"total.?arc", x["name"], re.I)), None)
if not db:
    db = dbs[0] if len(dbs) == 1 else None
if not db:
    raise RuntimeError("TOTAL_ARC_D1_NOT_FOUND")
DB = db["name"]
now = datetime.now(timezone.utc).isoformat().replace("+00:00","Z")

def q(v):
    if v is None:
        return "NULL"
    return "'" + str(v).replace("'", "''") + "'"

def rows(sql):
    raw = json.loads(wr(["d1","execute",DB,"--remote","--json","--command",sql]))
    raw = raw if isinstance(raw, list) else [raw]
    return [r for block in raw for r in (block.get("results") or [])]

def runfile(sql, name):
    path = "/tmp/" + name
    Path(path).write_text(sql)
    wr(["d1","execute",DB,"--remote","--file",path])

def table_exists(name):
    result = rows("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name="+q(name))
    return bool(result and int(result[0]["n"]) > 0)

if not table_exists("AuthUser"):
    raise RuntimeError("AUTH_USER_TABLE_NOT_FOUND")

target = rows(
    "SELECT id,institutionId,name,email,emailNormalized,role,active,lastLoginAt "
    "FROM AuthUser WHERE lower(emailNormalized)="+q(KEEP_EMAIL)+" LIMIT 2"
)
if len(target) != 1:
    raise RuntimeError(f"TARGET_ADMIN_COUNT_{len(target)}_EXPECTED_1")
target = target[0]
if str(target.get("role") or "") != "Admin":
    raise RuntimeError("TARGET_USER_IS_NOT_ADMIN")
if int(target.get("active") or 0) != 1:
    raise RuntimeError("TARGET_ADMIN_IS_NOT_ACTIVE")

target_id = str(target["id"])
before_users = rows("SELECT id,email,emailNormalized,role,active,institutionId FROM AuthUser ORDER BY createdAt ASC")

sql = [
    "UPDATE AuthUser SET active=0, lockedUntil=NULL, updatedAt="+q(now)+" WHERE lower(emailNormalized)<>"+q(KEEP_EMAIL)+";"
]
if table_exists("AuthSession"):
    sql.append(
        "UPDATE AuthSession SET revokedAt="+q(now)+", revokedReason='Disabled by administrator bulk user cleanup', revokedBy="+q(target_id)+
        " WHERE userId<>"+q(target_id)+" AND revokedAt IS NULL;"
    )
if table_exists("User"):
    sql.append("UPDATE User SET active=0 WHERE lower(email)<>"+q(KEEP_EMAIL)+";")
if table_exists("AuthEvent"):
    detail = json.dumps({
        "operation":"DISABLE_ALL_USERS_EXCEPT_ADMIN",
        "keepEmail":KEEP_EMAIL,
        "authUsersBefore":len(before_users),
        "executedAt":now
    }, separators=(",",":"))
    event_id = "user-disable-"+re.sub(r"[^0-9A-Za-z]","",now)
    sql.append(
        "INSERT INTO AuthEvent(id,userId,institutionId,eventType,email,role,ipAddress,userAgent,detail,createdAt) VALUES("+
        q(event_id)+","+q(target_id)+","+q(target.get("institutionId"))+","+
        q("OTHER_USERS_DISABLED")+","+q(KEEP_EMAIL)+","+q("Admin")+",NULL,NULL,"+q(detail)+","+q(now)+");"
    )
runfile("\n".join(sql), "disable_totalarc_users.sql")

remaining_active = rows("SELECT id,email,emailNormalized,role,active FROM AuthUser WHERE active=1 ORDER BY createdAt ASC")
non_target_active = [u for u in remaining_active if str(u.get("emailNormalized") or "").lower() != KEEP_EMAIL]
if len(remaining_active) != 1 or non_target_active:
    raise RuntimeError("ACTIVE_USER_ISOLATION_FAILED")
remaining = remaining_active[0]
if str(remaining.get("id")) != target_id or str(remaining.get("role") or "") != "Admin":
    raise RuntimeError("REMAINING_ACTIVE_USER_MISMATCH")

active_sessions_other = None
if table_exists("AuthSession"):
    active_sessions_other = int(rows(
        "SELECT COUNT(*) AS n FROM AuthSession WHERE userId<>"+q(target_id)+" AND revokedAt IS NULL AND expiresAt>"+q(now)
    )[0]["n"])
    if active_sessions_other != 0:
        raise RuntimeError("NON_TARGET_ACTIVE_SESSION_REMAINS")

print(json.dumps({
    "status":"SUCCESS",
    "database":DB,
    "keepEmail":KEEP_EMAIL,
    "authUsersTotal":len(before_users),
    "disabledUsers":sum(1 for u in before_users if str(u.get("emailNormalized") or "").lower()!=KEEP_EMAIL),
    "remainingActiveUsers":len(remaining_active),
    "remainingActiveUser":{"email":remaining.get("email"),"role":remaining.get("role"),"active":remaining.get("active")},
    "nonTargetActiveSessions":active_sessions_other
}, indent=2, ensure_ascii=False))
