---
name: legend-state
description: "Use when working with Legend-State v2 (@legendapp/state v2.x) state management, observables, fine-grained reactivity, persistence (AsyncStorage, MMKV), reactive React Native components (observer, Memo, Show, useSelector), batching, or syncing in this project."
---

# Legend-State v2 Skill & Rules Guide

This skill provides rules, patterns, and reference documentation for **Legend-State v2** (`@legendapp/state` `^2.1.15`) in React Native and Expo.

---

## 1. Core Principles & Golden Rules

1. **Do not use v1 or v3 APIs**:
   - This project uses `@legendapp/state` **v2.x**.
   - Use `observable()`, `computed()`, `observer()`, `persistObservable()`, and `configureObservablePersistence()`.
   - Do NOT use experimental/deprecated signals from v1 or upcoming v3 syntax.

2. **Fine-Grained Reactivity**:
   - Wrap components reading observables in `observer()`:
     ```tsx
     import { observer } from "@legendapp/state/react";

     export const MyComponent = observer(() => {
       const text = state$.settings.name.get();
       return <Text>{text}</Text>;
     });
     ```
   - Use `.get()` to subscribe inside reactive render contexts (`observer`, `useSelector`, `<Memo>`).
   - Use `.peek()` inside event handlers, callbacks, or functions where you only need the current value **without** creating a subscription/triggering re-renders:
     ```tsx
     const handlePress = () => {
       const current = state$.counter.peek();
       state$.counter.set(current + 1);
     };
     ```

3. **Modifying Observables**:
   - `.set(val)`: Overwrites the target observable value.
   - `.assign(partial)`: Merges partial properties into an object observable (shallow merge).
   - `.delete()`: Removes a property from an object or element from an array.
   - Batch multiple updates with `batch(() => { ... })` to prevent intermediate renders.

4. **Persistence Rules (AsyncStorage & MMKV)**:
   - Configure global persistence once before defining persisted observables:
     ```tsx
     import { configureObservablePersistence } from "@legendapp/state/persist";
     import { ObservablePersistAsyncStorage } from "@legendapp/state/persist-plugins/async-storage";
     import AsyncStorage from "@react-native-async-storage/async-storage";

     configureObservablePersistence({
       pluginLocal: ObservablePersistAsyncStorage,
       localOptions: {
         asyncStorage: { AsyncStorage },
       },
     });
     ```
   - For ultra-high performance on native, MMKV (`ObservablePersistMMKV` from `@legendapp/state/persist-plugins/mmkv`) provides synchronous zero-latency reads.
   - Persist state using `persistObservable(myObservable$, { local: 'unique_storage_key' })`.

5. **Rendering Primitives & Lists**:
   - Use `<Memo>` for rendering isolated child values without re-rendering parent components:
     ```tsx
     import { Memo } from "@legendapp/state/react";
     <Memo>{() => state$.heavyNestedValue.get()}</Memo>
     ```
   - Use `<Show>` for conditional rendering based on observables:
     ```tsx
     import { Show } from "@legendapp/state/react";
     <Show if={state$.isLoggedIn} else={() => <LoginScreen />}>
       {() => <Dashboard />}
     </Show>
     ```

---

## 2. Topic References in this Skill

For in-depth official documentation, refer to the files in [`./references/`](./references/):

* **Guides & Performance:**
  * [`guides__performance.md`](./references/guides__performance.md) — Optimization strategies, preventing render cascades
  * [`guides__persistence.md`](./references/guides__persistence.md) — Storage configuration, transforms, IndexedDB/MMKV/AsyncStorage
  * [`guides__patterns.md`](./references/guides__patterns.md) — State architecture patterns

* **React Integration:**
  * [`react__react-introduction.md`](./references/react__react-introduction.md) — React hooks & components overview
  * [`react__react-api.md`](./references/react__react-api.md) — `observer`, `use$`, `useSelector`, `useObservable`
  * [`react__fine-grained-reactivity.md`](./references/react__fine-grained-reactivity.md) — Micro-updates, `<Memo>`, `<Show>`, `<Computed>`
  * [`react__helpers-and-hooks.md`](./references/react__helpers-and-hooks.md) — Utility hooks
  * [`react__tracing.md`](./references/react__tracing.md) — Debugging re-renders with `useTraceListeners` & `useTraceUpdates`

* **Observables & Core Usage:**
  * [`intro__getting-started.md`](./references/intro__getting-started.md) — Core concepts walkthrough
  * [`usage__observable.md`](./references/usage__observable.md) — Observable methods (`get`, `set`, `assign`, `delete`)
  * [`usage__reactivity.md`](./references/usage__reactivity.md) — Tracking, `observe()`, `when()`
  * [`usage__helper-functions.md`](./references/usage__helper-functions.md) — `batch`, `computed`, `isObservable`
  * [`usage__configuring.md`](./references/usage__configuring.md) — Global settings & plugins

* **Migration & Architecture:**
  * [`other__migrating.md`](./references/other__migrating.md) — V1 to V2 migration nuances
  * [`intro__fast.md`](./references/intro__fast.md) & [`intro__why.md`](./references/intro__why.md) — Architecture internals & benchmarks

