---
title: Fault Diagnosis Decision Tree – No Gas Flow
category: Fault Diagnosis
id: DOC-FD-003
---

# Fault Diagnosis Decision Tree – No Gas Flow

## Purpose
Systematic decision tree for diagnosing "no gas flow" issues at field installations.

## Safety Warning
- Before investigating, confirm there is no gas escape.
- Do NOT force-open any valve.
- If you smell gas at any point, stop and follow leak detection procedure DOC-IP-001.

## Decision Tree

### Step 1: Is the emergency control valve (ECV) open?
- **No** → Open ECV. If gas flows, record event and investigate why it was closed.
- **Yes** → Proceed to Step 2.

### Step 2: Is the service isolation valve open?
- **No** → Open service valve. If gas flows, record and investigate.
- **Yes** → Proceed to Step 3.

### Step 3: Is the meter bypass valve closed?
- Check meter bypass valve. If open, close it.
- If meter is bypassed and still no flow → Proceed to Step 4.

### Step 4: Check inlet pressure at meter.
- Connect calibrated gauge to meter inlet test point.
- **No pressure** → Issue is upstream. Contact network operator.
- **Pressure present** → Proceed to Step 5.

### Step 5: Is the meter operational?
- Check meter display/index.
- **Meter fault indicated** → Replace meter per DOC-EM-003.
- **Meter appears normal** → Proceed to Step 6.

### Step 6: Check outlet pressure at meter.
- Connect gauge to meter outlet test point.
- **No outlet pressure** → Meter blockage likely. Replace meter.
- **Pressure present** → Proceed to Step 7.

### Step 7: Check downstream isolation valves.
- Walk downstream and verify all isolation valves are open.
- **Closed valve found** → Open and confirm flow.
- **All open** → Proceed to Step 8.

### Step 8: Check downstream regulator.
- Verify regulator set pressure and outlet pressure.
- **Low/no outlet** → Refer to DOC-FD-001 (regulator fault).
- **Normal outlet** → Proceed to Step 9.

### Step 9: Check appliance isolation.
- Verify appliance isolation valves are open.
- Check appliance inlet filter for blockage.
- If unresolved, escalate to specialist engineer.

## Escalation
If root cause cannot be determined after completing decision tree:
1. Record all findings.
2. Contact technical support desk.
3. Arrange specialist attendance within 4 hours (priority fault).

## Reference
Gas Supply Fault Handbook – Section 3
Company Procedure FD-001 – No Gas Supply
