# Startup Process Review

## Overview
The startup process follows these steps:
1. Load configuration
2. Initialize logger  
3. Create client (SSH or Local)
4. Create MCP server
5. Register tool handlers
6. Connect stdio transport
7. Set up keepalive mechanisms

## Issues Found

### CRITICAL - Could cause production failures:

#### 1. **Configuration Validation Missing**
**Location**: `src/config.js`, lines 22-23 and `src/index.js`, line 22

**Problem**: Configuration is loaded and parsed as JSON, but no schema validation occurs. Invalid or incomplete config silently succeeds.
- Missing fields: `hpcHost`, `computingId`, `sshKeyPath`, `userIsRemote` are never validated
- Invalid `userIsRemote` value is not caught (could be any type)
- Invalid SSH key path is not validated until first use (causes cryptic SSH error)

**Impact**: Users could run server with invalid config, get confusing errors later

**Fix needed**: Validate config schema in loadConfig()

---

#### 2. **Inconsistent Request Parameter Handling**
**Location**: `src/index.js`, lines 61 and 82

**Problem**: 
```javascript
const { name, arguments: args } = request.params || request;
```
This fallback to `request` is incorrect per MCP spec. Requests should always have the structure `{ params: { name, arguments } }`.

**Impact**: If MCP client sends unexpected message format, could crash with destructuring error

**Fix needed**: Strict parameter validation

---

#### 3. **Transport Close Exits with Success Code**
**Location**: `src/index.js`, lines 102-104

```javascript
transport.onclose = () => {
  logStartup('WARNING: Transport closed!');
  process.exit(0);  // ← Should be exit(1)
};
```

**Problem**: Process exits with code 0 (success) when transport unexpectedly closes. This makes it indistinguishable from normal shutdown for monitoring/restart policies.

**Impact**: Orchestrators won't restart server if transport fails

**Fix needed**: Exit with code 1

---

#### 4. **Client Close Not Protected**
**Location**: `src/index.js`, lines 155-156

```javascript
if (client) {
  client.close();  // ← Could throw, not wrapped
}
```

**Problem**: `client.close()` is not wrapped in try-catch. If SSHClient is used and close() throws (or if someone adds it later), SIGINT handler crashes.

**Impact**: Ungraceful shutdown if client.close() fails

**Fix needed**: Wrap in try-catch

---

#### 5. **Logger.js Has Silent Failures**
**Location**: `src/logger.js`, lines 23-25 and 108-110

**Problem**: All logging catch blocks silently fail with no indication to user that logs aren't being written.

```javascript
catch (error) {
  // Silently fail - don't write to stderr as it corrupts MCP protocol
}
```

**Impact**: Disk full or permission issues cause silent log loss; user has no indication

**Fix needed**: Find alternative error reporting (file won't be huge issue since pre-transport, but post-transport needs solution)

---

### HIGH - Should be fixed for reliability:

#### 6. **initializeLogger() Signature Mismatch**
**Location**: `src/index.js`, line 26

```javascript
initializeLogger(config);  // passes config
```

**Location**: `src/logger.js`, line 9

```javascript
export function initializeLogger() {  // doesn't use config
```

**Problem**: Config is passed but ignored, making the signature misleading

**Fix needed**: Either use config parameter or remove it

---

#### 7. **Missing Tool Definition Validation**
**Location**: `src/tools/index.js`, lines 47-49

**Problem**: The toolHandlers Map is created without validating that all tools are properly defined or that tool names are unique.

**Impact**: If a tool is accidentally misnamed or duplicate, it silently fails to register

**Fix needed**: Add validation loop

---

#### 8. **Heartbeat Interval Has No Clear Purpose**
**Location**: `src/index.js`, lines 119-122

```javascript
const heartbeatInterval = setInterval(() => {
  // Silent heartbeat - just keeps process alive
}, 30000);
heartbeatInterval.ref();
```

**Problem**: The interval does nothing - it's just calling an empty function every 30s. This is wasteful and unclear why it exists.

**Impact**: Slight CPU/resource waste; confusing code

**Fix needed**: Either remove or replace with explicit process keep-alive comment

---

### MEDIUM - Best practices:

#### 9. **Error Logging in Pre-Startup**
**Location**: `src/config.js`, lines 9-18

**Problem**: `console.error()` is used before MCP connection, which is technically OK, but inconsistent with post-connection behavior where all logging must be file-based.

**Fix needed**: Use consistent logging mechanism throughout

---

#### 10. **Unhandled Promise in Tool Handler**
**Location**: `src/index.js`, lines 59-95

**Problem**: The tool handler doesn't return a rejected promise on unknown tools or handler errors - it always returns a success result structure with an error flag. While this prevents crashes, it means:
- Unhandled promise rejections in the handler would trigger the global handler
- Tool logic errors could leak past the try-catch if they're in an async callback not awaited

**Fix needed**: Ensure all async code paths are properly awaited and wrapped

---

## Summary of Critical Fixes Needed

| Issue | Severity | Risk | Fix Time |
|-------|----------|------|----------|
| Config validation missing | CRITICAL | Server runs with invalid config | 30 min |
| Transport close code | CRITICAL | Won't auto-restart | 5 min |
| Client.close() unprotected | CRITICAL | SIGINT can crash | 10 min |
| Request parameter handling | CRITICAL | Protocol mismatch crash | 10 min |
| Logger failures silent | HIGH | No visibility | 20 min |
| initializeLogger signature | HIGH | Code clarity | 5 min |
| Tool validation | HIGH | Silent failures | 15 min |
| Heartbeat purpose unclear | MEDIUM | Code clarity | 5 min |

