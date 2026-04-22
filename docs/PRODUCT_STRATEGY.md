# Sweet Home Product Strategy

## Purpose

This document defines how Sweet Home should evolve from a capable small POS into a stronger day-to-day operating system for a real bakery or pastry shop.

It is based on the current implementation, not on generic POS assumptions.

Relevant current modules:

- `frontend/src/pages/RegisterSale.tsx`
- `frontend/src/pages/Inventory.tsx`
- `frontend/src/pages/SalesHistory.tsx`
- `frontend/src/pages/Shifts.tsx`
- `frontend/src/pages/DailySummary.tsx`
- `frontend/src/pages/Users.tsx`
- `frontend/src/components/ProductGrid.tsx`
- `backend/app/routers/sales.py`
- `backend/app/routers/products.py`
- `backend/app/routers/shifts.py`
- `backend/app/services/report_service.py`

## Executive Summary

Sweet Home already has a strong operational base:

- fast mobile-first sales
- offline-first sync
- shift opening and closing
- stock deduction on sale
- cancellations with stock restore
- low-stock visibility
- daily reporting

That is good foundation work.

But the product is still too centered on "recording what happened" and not strong enough at "helping the business run better in real time."

The biggest strategic gap is that Sweet Home behaves more like a lightweight cashier + admin tool than a full operating tool for a bakery. The missing value is not another report. The missing value is better support for:

- orders and future deliveries
- real cash movements
- guided inventory movements
- faster product access during rush hours
- production and replenishment decisions

## Product Positioning

Sweet Home should not try to be a generic POS for all businesses.

Sweet Home should be:

- the fastest way for Sweet Home staff to sell from a phone
- the simplest way to control daily cash and stock without confusion
- the clearest way to manage bakery orders, pickups, and production needs

That means the product should optimize for:

- speed during peak selling
- certainty during cash reconciliation
- fewer operational mistakes
- fewer forgotten tasks
- less mental load for staff

## What The Product Does Well Today

These are strong choices and should stay:

### 1. Offline-first sales

This is one of the best product decisions in the app.

Evidence:

- `README.md`
- `frontend/src/App.tsx`
- `frontend/src/db/sync.ts`

Why it matters:

- sales cannot stop because the backend is sleeping or internet is weak
- this is practical value, not just technical sophistication

### 2. Shift-based operation

Shifts are the right model for accountability and daily operation.

Evidence:

- `frontend/src/pages/Shifts.tsx`
- `backend/app/routers/shifts.py`
- `backend/app/routers/sales.py`

Why it matters:

- ties sales to a responsible user
- makes cash closing meaningful
- creates a useful daily rhythm

### 3. Cancellations with stock restoration

This is a high-value control feature and absolutely worth keeping.

Evidence:

- `frontend/src/pages/SalesHistory.tsx`
- `backend/app/routers/sales.py`

Why it matters:

- real businesses make mistakes
- correction flows matter as much as happy paths

### 4. Low-stock and summary visibility

The reporting model is already more serious than a barebones POS.

Evidence:

- `frontend/src/pages/DailySummary.tsx`
- `backend/app/services/report_service.py`
- `frontend/src/pages/Inventory.tsx`

Why it matters:

- gives management feedback without leaving the app

## What Is Overbuilt, Underleveraged, or Overprioritized

These are not bad features. They are just not the highest-leverage product bets right now.

### 1. Daily email report

Evidence:

- `README.md`
- `backend/app/services/email_service.py`
- `backend/app/services/scheduler.py`

Assessment:

- useful, but lower impact than orders, cash movements, or production planning
- should not receive priority over operational workflows

### 2. User management as a major module

Evidence:

- `frontend/src/pages/Users.tsx`
- `frontend/src/App.tsx`

Assessment:

- necessary admin utility
- not a core differentiator
- should remain lightweight and out of the way

### 3. Static reporting before guided operations

Evidence:

- `frontend/src/pages/DailySummary.tsx`
- `backend/app/services/report_service.py`

Assessment:

- reports help look backward
- the product still needs more tools that help staff decide what to do next

## Highest-Value Missing Product Capabilities

## 1. Orders / Preorders / Pickups

This is the biggest missing capability.

Current evidence of absence:

- no frontend route for orders in `frontend/src/App.tsx`
- no backend router or model for orders in `backend/app/main.py`

Why this matters:

- bakeries often sell future pickups, custom cakes, reserved items, and partial-payment orders
- without orders, the app mainly supports immediate counter sales
- this leaves a major part of bakery operations outside the system

Recommended capability:

- create order
- pickup date and time
- customer name and phone
- notes
- partial payment / deposit
- order status: new, in production, ready, delivered, cancelled
- balance pending

This should become a first-class product area, not a workaround.

## 2. Cash movements

Current state:

- the app supports opening and closing cash via shifts
- there is no explicit workflow for cash in/out events during the day

Evidence:

- `frontend/src/pages/Shifts.tsx`
- `backend/app/routers/shifts.py`

Missing flows:

- petty cash expense
- supplier payment
- cash withdrawal
- adding emergency float
- manual adjustment with reason

Why this matters:

- a shift can be "correctly" opened and closed yet still feel wrong operationally if mid-day movements are invisible

## 3. Inventory movements with reasons

Current state:

- stock can be directly edited and incremented/decremented

Evidence:

- `frontend/src/pages/Inventory.tsx`
- `backend/app/routers/products.py`

Missing flows:

- production added
- spoilage / waste
- breakage
- manual correction
- purchase received

Why this matters:

- direct stock editing is fast, but weak for traceability
- bakery inventory is highly affected by waste and replenishment

## 4. Faster catalog access in sales

Current state:

- product cards are shown in a single grid
- there is no category system, favorites section, or search-first selling flow

Evidence:

- `frontend/src/components/ProductGrid.tsx`
- `frontend/src/pages/RegisterSale.tsx`

Why this matters:

- a cashier under pressure should not have to visually scan a long list
- speed improvements here compound every single day

Recommended additions:

- favorites
- quick search
- categories
- recent items
- "most sold today"

## 5. Production and replenishment guidance

Current state:

- the app shows low stock and top sellers

Evidence:

- `frontend/src/pages/DailySummary.tsx`
- `backend/app/services/report_service.py`

Missing value:

- "what should we prepare next?"
- "what should be restocked this afternoon?"
- "what will likely run out today?"

This is where the product can become more than a POS.

## Product Principles

Every future change should follow these rules:

### 1. Operations first

If a feature does not reduce time, mistakes, or uncertainty in day-to-day work, it is not a priority.

### 2. One-screen confidence

Users should understand what they need to do from the current screen without guessing.

### 3. Action before reporting

If forced to choose, build tools that help the user act before building tools that help them analyze afterward.

### 4. Bakery-specific value beats generic POS breadth

Do not chase restaurant, retail, or restaurant-table workflows unless Sweet Home genuinely needs them.

### 5. Mobile speed is non-negotiable

Any feature that slows the sales flow must justify itself strongly.

## Proposed Product Restructure

The app should be reorganized around operational jobs, not around technical modules.

## Current structure

Current main areas:

- Sale
- Inventory
- History
- Shifts
- Summary
- Users

This is workable, but still somewhat admin-shaped.

## Proposed structure

### A. Operate

Core daily execution area.

- `Venta`
- `Pedidos`
- `Caja`

Meaning:

- `Venta`: immediate walk-in sales
- `Pedidos`: future pickups, deposits, status tracking
- `Caja`: open, close, movements, current cash state

### B. Control

Review and correction area.

- `Historial`
- `Resumen`

Meaning:

- `Historial`: sales, cancellations, rejected syncs, order history later
- `Resumen`: totals, top products, cash performance, production signals

### C. Catalog

Product and stock management area.

- `Productos`
- `Movimientos`

Meaning:

- `Productos`: product data, pricing, active/inactive, photos
- `Movimientos`: stock changes with reasons and audit trail

### D. Settings

Low-frequency administration.

- `Usuarios`
- business settings later

This should stay out of the primary daily navigation.

## Feature Decisions

## Must Keep and Deepen

- offline-first sync
- fast sale registration
- shift control
- cancellation flow
- low stock visibility
- product photos
- mixed payments

## Keep but De-emphasize

- user management
- printable daily summary
- daily report email

## Add Next

- orders
- cash movements
- stock movements with reasons
- search, favorites, and categories in sales
- production suggestions

## Avoid For Now

- loyalty points
- CRM-heavy customer profiles
- promotions engine
- coupon system
- supplier management
- accounting exports
- highly configurable permissions matrix

These may be useful later, but they are not the highest-value next moves.

## Roadmap

## Phase 1: Stabilize and sharpen daily operation

Goal:

- make current flows more reliable, faster, and more trustworthy

Deliver:

- finish checkout friction cleanup
- strengthen shift reliability and refresh behavior
- improve sync issue visibility and recovery
- add search and favorites in sales
- reduce inventory mistakes with clearer editing states

Success signals:

- faster average sale registration
- fewer failed or abandoned sales
- fewer support questions around turns, sync, and stock

## Phase 2: Add missing bakery workflow coverage

Goal:

- cover work that currently happens outside the app

Deliver:

- orders module
- deposits and pending balances
- pickup-ready workflow
- order status board
- customer name and phone on orders

Success signals:

- fewer paper or WhatsApp-only order workflows
- fewer forgotten pickups
- clearer pending-payment tracking

## Phase 3: Make cash and inventory operationally stronger

Goal:

- improve trust and traceability

Deliver:

- cash in/out movements with reasons
- stock movements with reasons
- stock movement history
- basic discrepancy reporting

Success signals:

- fewer unexplained cash differences
- fewer unexplained stock changes
- easier end-of-day review

## Phase 4: Turn the app into a decision tool

Goal:

- move from recording operations to guiding operations

Deliver:

- replenishment suggestions
- likely-to-run-out items
- product velocity indicators
- order load and production view

Success signals:

- fewer stockouts
- better prep decisions
- less overproduction

## Suggested Navigation After Restructure

Bottom navigation should focus on the highest-frequency jobs:

- `Venta`
- `Pedidos`
- `Caja`
- `Historial`
- `Más`

Inside `Más`:

- `Productos`
- `Movimientos`
- `Resumen`
- `Usuarios`

If the app remains very small, `Historial` and `Caja` could swap depending on usage frequency, but `Usuarios` should not sit in the primary operational path.

## Suggested Metrics

Track these as product health metrics:

- median time to register a sale
- percentage of sales completed in under 20 seconds
- number of rejected sync sales
- number of end-of-day cash variances
- number of stock adjustments without reason
- number of orders delivered on time
- number of orders with pending balance
- number of stockout events on top-selling items

## Final Product Verdict

Sweet Home already has enough quality to become a serious small-business product.

But the next leap will not come from more generic admin features.

The best version of Sweet Home is:

- faster at selling
- stronger at cash control
- better at managing bakery orders
- smarter about stock and production

That is the strategy.

Not "more features."

Better operational features, in a cleaner structure, for the real business Sweet Home actually runs.
