PRAGMA foreign_keys=OFF;
-- 面试题库 seed：12 条，由 scripts/import.mjs 自动生成（勿手改，生成于 2026-11-17 23:11:41 +08:00）；单引号已按 SQL 规则转义
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('4803f6379dabe7765bdf4f1b','手写带并发限制的异步调度器，limit 个并发且完成即补位','字节一面高频题：实现一个调度器，传入并发上限 limit，返回一个函数用于提交任务。要求任意时刻同时运行的任务不超过 limit，任务完成后立刻从队列取下一个，任务可以是返回 Promise 的函数，失败也要让出槽位，调用方能拿到结果或错误。','**要求与边界**：并发数恒不超过 limit；超出的任务排队；完成即补位，不等整批结束；同步抛错与 reject 都必须释放槽位；调用方拿到 resolve/reject。

**实现**
```js
function createScheduler(limit) {
  const queue = [];
  let running = 0;
  const next = () => {
    if (running >= limit || queue.length === 0) return;
    const job = queue.shift();
    running += 1;
    Promise.resolve()
      .then(job.task)
      .then(job.resolve, job.reject)
      .finally(() => {
        running -= 1;
        next();
      });
  };
  return (task) => new Promise((resolve, reject) => {
    queue.push({ task, resolve, reject });
    next();
  });
}
```

**关键点**
1. 用 running 计数判断是否有空位，不能用队列长度，队列长度只反映等待数量。
2. Promise.resolve().then(job.task) 让同步 throw 也变成 rejection，统一走 finally 释放槽位。
3. 释放后立刻 next() 递归取下一个，这才是完成即补位；如果等一批结束再统一调度，并发上限会变成批次上限。
4. 每个任务外面包一层 Promise，把 resolve/reject 存进队列项，接口才和普通 Promise 一致。

**复杂度与用例**：时间 O(n)，空间 O(limit + 队列)。用例 limit=2 提交 5 个任务，实测最大并发为 2；其中第 3 个任务 reject，其余四个仍正常完成，最后一个任务的 reject 能被外层 catch 到。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('dc0f0aabaab9b129b97453fd','手写 Promise.all，要求保序、空数组立即完成、失败快速返回','要求不用内置 Promise.all 实现一个同名方法：传入可迭代对象，返回 Promise；所有任务成功时按输入顺序返回结果数组，任一失败立即 reject 且忽略后续结果，空数组同步进入 fulfilled，非 Promise 值直接当作已成功的值。','**要求与边界**：结果顺序与输入一致，与完成顺序无关；空数组立即 resolve；任一失败立即 reject；非 Promise 值、thenable 都要兼容；数组长度先取快照，防止迭代过程中长度变化。

**实现**
```js
function promiseAll(iterable) {
  return new Promise((resolve, reject) => {
    const items = Array.from(iterable);
    const results = new Array(items.length);
    let count = 0;
    if (items.length === 0) return resolve(results);
    items.forEach((item, index) => {
      Promise.resolve(item).then((value) => {
        results[index] = value;
        count += 1;
        if (count === items.length) resolve(results);
      }, reject);
    });
  });
}
```

**关键点**
1. 先 Array.from 展开可迭代对象并落数组，长度固定，避免边遍历边变长。
2. 结果按下标写入 results，完成顺序任意都不会乱序，这是"保序"的唯一正确做法。
3. 用计数器判断是否全部完成，不要用 results.filter 之类的 O(n) 判断，每次回调都扫一遍会让整体退化成 O(n²)。
4. 失败分支直接传 reject，Promise 一旦 settle 后续回调自动失效，天然实现快速失败。
5. Promise.resolve(item) 同时兼容 Promise、thenable 和普通值。

**复杂度与用例**：时间 O(n)，空间 O(n)。用例：三个任务分别延迟 90/10/50 毫秒，结果数组仍按输入顺序；空数组立即 fulfilled 且结果为 []；第二个任务 reject 时返回的 Promise 立即 rejected，第三个任务的结果被忽略；传入 [1, 2, 3] 得到 [1, 2, 3]。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('6f31e6404e69300f48d19a0f','手写 Function.prototype.bind，必须正确处理 new 与原型链','要求实现 bind：绑定 this 与预设参数，返回新函数；用 new 调用返回的函数时，this 指向新实例而不是绑定值，实例要能通过 instanceof 判断为原构造函数；同时支持后续调用继续传参，箭头函数这类没有 prototype 的函数不能报错。','**要求与边界**：偏函数（预设参数 + 调用参数拼接）；bind 后 new 生效，绑定 this 失效；新实例 instanceof 原构造函数为 true；可重复 bind 只有第一次生效；箭头函数没有 prototype，不能直接 Object.create。

**实现**
```js
Function.prototype.myBind = function (ctx, ...preset) {
  const fn = this;
  function Bound(...rest) {
    if (new.target) {
      const self = Object.create(Bound.prototype);
      const ret = fn.apply(self, preset.concat(rest));
      return ret && (typeof ret === ''object'' || typeof ret === ''function'') ? ret : self;
    }
    return fn.apply(ctx, preset.concat(rest));
  }
  if (fn.prototype) Bound.prototype = Object.create(fn.prototype);
  return Bound;
};
```

**关键点**
1. new.target 只在 Bound 内部有值，这是区分 new 与普通调用最可靠的方式。
2. new 分支先建 Object.create(Bound.prototype) 再 apply，既复刻构造函数返回对象的规则，也让 instanceof Bound 与原构造函数同时成立。
3. 参数顺序是预设在前、调用在后，bind 多次只有第一次生效。
4. 只有 fn 有 prototype 时才建立原型链，箭头函数没有 prototype，Object.create(undefined) 会抛错。
5. 边界：class 构造函数不能直接 apply 调用（抛 TypeError），真实 bind 走 [[Construct]]，手写版在这类场景不兼容。

**复杂度与用例**：时间与空间都是 O(参数个数)。用例：Point 构造函数绑定 {x:9} 并预设 1，new Bound(2) 得到 x=1、y=2，且 instanceof Point 与 instanceof Bound 都为 true；普通调用得到绑定的 this；bind 后再 bind，this 仍是第一次的。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('48b454fd555c0d53dce429b3','手写 Koa 风格 compose，next 嵌套支持异步与重复调用检测','要求实现中间件组合函数：把中间件数组合成一个函数，执行时形成"洋葱模型"，每个中间件通过 await next() 进入下一层，返回后继续执行自身后续逻辑；支持异步中间件，同一中间件重复调用 next 要报错，下游不调用 next 时要正常结束。','**要求与边界**：数组元素必须是函数；每个 next 只能调用一次；异步中间件按序等待；最内层的 next 返回已完成的 Promise；同步抛错要转成 rejection。

**实现**
```js
function compose(middlewares) {
  return function (ctx, next) {
    let last = -1;
    const dispatch = (i) => {
      if (i <= last) return Promise.reject(new Error(''next() 被调用了多次''));
      last = i;
      const fn = i === middlewares.length ? next : middlewares[i];
      if (!fn) return Promise.resolve();
      try {
        return Promise.resolve(fn(ctx, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    };
    return dispatch(0);
  };
}
```

**关键点**
1. dispatch 返回 Promise 并作为 next 的返回值，await next() 才能等到整个下游链路结束，这是洋葱模型的关键。
2. last 记录已执行到的最大下标：第一次调用 dispatch(2) 时 last 变成 2，再次调用 dispatch(2) 命中 i <= last 直接 reject，完成重复调用检测。
3. i === middlewares.length 时用外部传入的 next 作为终结者，没有就返回已完成 Promise，保证最内层 await next() 不报错。
4. try/catch 包住 fn 的同步执行，把同步 throw 统一成 rejected Promise，调用方只需处理一种错误形态。
5. Promise.resolve(...) 包一层，既兼容同步中间件也兼容异步。

**复杂度与用例**：时间 O(中间件数量)，空间 O(嵌套深度)。用例：a、b 两个中间件按 a 前 → b 前 → b 后 → a 后 的顺序输出；b 里 await 一个延迟 20 毫秒的任务，最终完成时刻晚于延迟；同一中间件调用两次 next 得到 rejected；空数组调用时直接 resolved。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('a270577e1a53f75633522cc5','手写深拷贝，覆盖循环引用、Map/Set、Symbol、Date 和 RegExp','要求实现 deepClone：支持嵌套对象与数组、循环引用、Map 与 Set（键值都要深拷贝）、Symbol 作为键、Date、RegExp（含 lastIndex）、保留原型；不能把函数、原始值拷坏；要求说明为什么用 WeakMap 而不是普通对象做缓存。','**要求与边界**：循环引用不爆栈；拷贝自有可枚举属性（含 Symbol 键）；Map 的键也要深拷；保留原型。

**实现**
```js
function deepClone(v, cache = new WeakMap()) {
  if (!v || typeof v !== ''object'') return v;
  if (cache.has(v)) return cache.get(v);
  const tag = Object.prototype.toString.call(v).slice(8, -1);
  if (tag === ''Date'') return new Date(v.getTime());
  if (tag === ''RegExp'') {
    const re = new RegExp(v.source, v.flags);
    re.lastIndex = v.lastIndex;
    return re;
  }
  const out = tag === ''Map'' ? new Map()
    : tag === ''Set'' ? new Set()
    : Array.isArray(v) ? []
    : Object.create(Object.getPrototypeOf(v));
  cache.set(v, out);
  if (tag === ''Map'') v.forEach((val, k) => out.set(deepClone(k, cache), deepClone(val, cache)));
  else if (tag === ''Set'') v.forEach((val) => out.add(deepClone(val, cache)));
  else for (const k of Reflect.ownKeys(v)) {
    const d = Object.getOwnPropertyDescriptor(v, k);
    if (d && d.enumerable) out[k] = deepClone(v[k], cache);
  }
  return out;
}
```

**关键点**
1. 缓存用 WeakMap：普通对象做键会被转成同一字符串互相覆盖，且会永久持有引用。
2. cache.set 必须在递归之前，否则子属性指回父对象时命不中缓存，循环引用爆栈。
3. toString 取标签区分 Map、Set、Date、RegExp；Reflect.ownKeys 才能拿到 Symbol 键。
4. Object.create(原原型) 保留方法但不执行构造函数；已知差距是不处理 WeakMap、不可枚举属性和类型化数组。

**复杂度与用例**：时间 O(节点数 + 边数)，空间 O(节点数)。用例：a.self = a 拷贝后自引用指向新对象；Map 的对象键克隆后是新对象；Symbol 键与 RegExp 的 lastIndex 保留。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('a53a3b88ef461bcee830fcb3','手写防抖 debounce，支持 immediate 立即执行的首次触发','要求实现 debounce：连续触发时只执行最后一次，可配置等待时间；支持 immediate 选项，首次触发立即执行、后续等待期内不再执行；返回的函数要能拿到执行结果，提供 cancel 取消待执行的回调；this 与参数要正确透传。','**要求与边界**：非 immediate 时在停止触发 wait 毫秒后执行最后一次；immediate 时首次立即执行，冷却期内不执行；返回值要透传；this 与参数保持；提供 cancel 清理定时器。

**实现**
```js
function debounce(fn, wait, immediate = false) {
  let timer = null;
  let result;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    if (immediate) {
      const callNow = timer === null;
      timer = setTimeout(() => {
        timer = null;
      }, wait);
      if (callNow) result = fn.apply(this, args);
    } else {
      timer = setTimeout(() => {
        timer = null;
        result = fn.apply(this, args);
      }, wait);
    }
    return result;
  }
  debounced.cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  return debounced;
}
```

**关键点**
1. 每次触发先 clearTimeout，再重新计时，等待期从最后一次触发开始算。
2. immediate 分支用 timer 是否存在判断是否处于冷却期，用 callNow 而不是直接判断，是因为赋值顺序会影响结果。
3. timer 置 null 必须在定时器回调里做，不能在 clearTimeout 之后统一置 null，否则冷却期判断永远成立。
4. 结果存到闭包变量 result 并返回；非 immediate 时返回的是上一次执行的结果。
5. 用 apply 保留调用时的 this，箭头函数形式会丢失 this，这是常见扣分点。
6. cancel 只清定时器，不重置 result，业务上通常还要把 result 置为 undefined。

**复杂度与用例**：单次调用 O(1)，空间 O(1)。用例：连续调用 5 次，结束后只执行 1 次且参数是最后一次的；immediate 模式下首次立即执行，随后 5 次在等待期内被吞掉，等 wait 后再次触发才执行；调用 cancel 后原回调不再执行。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('ef324cb9cda98f5592e912a0','手写节流 throttle，对比时间戳版与定时器版的差异','要求实现节流：单位时间内最多执行一次。需要写出时间戳版和定时器版两种实现，并说明首次执行时机、末次是否保证执行、this 与参数如何透传，以及各自适合的业务场景；追问如何做到首尾都执行。','**要求与边界**：wait 毫秒内最多执行一次；首次执行时机与末次补执行是两个版本的核心差异；this 与参数必须透传；高频触发下不能创建多余定时器。

**实现**
```js
function throttleByTime(fn, wait) {
  let last = 0;
  return function (...args) {
    const now = Date.now();
    if (now - last < wait) return;
    last = now;
    return fn.apply(this, args);
  };
}

function throttleByTimer(fn, wait) {
  let timer = null;
  return function (...args) {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, wait);
  };
}
```

**关键点**
1. 时间戳版首次立即执行（last 初值为 0，时间差一定大于 wait），窗口内后续触发直接丢弃，所以末次不保证执行。适合按钮防连点、滚动进度这类"要立刻反馈"的场景。
2. 定时器版首次延迟 wait 才执行，但窗口内的最后一次触发一定会执行。适合搜索联想、日志上报这类"结果必须送达"的场景。
3. 两者混合才能首尾都执行：进入时立即调用一次，同时起一个定时器，窗口结束时若期间有触发则补执行，需要额外记录 lastArgs 与 lastThis。
4. 定时器版用 timer 是否存在作为锁，避免每帧创建新定时器；异步回调里把 timer 置 null 必须放在最前面，否则异常会导致永久锁死。
5. 更精确的做法是记录上次执行时间，用 Math.max(wait - (now - last), 0) 作为定时器延迟，lodash 的 leading/trailing 就是这个思路。

**复杂度与用例**：单次调用 O(1)，空间 O(1)。用例：在 20 毫秒内连续调用 10 次，时间戳版执行 1 次（首次），定时器版立即执行 0 次、wait 后执行 1 次；两次调用间隔大于 wait 时两个版本都执行。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('8e1c86ab9b9d83c9852aa301','手写数组扁平化 flat，支持指定深度并给出迭代写法','要求实现 flat(arr, depth)：默认只展开一层，depth 可指定层数，Infinity 表示完全展开；同时给出递归与显式栈两种写法，说明各自的边界与性能差异；追问原生 flat 如何处理稀疏数组，以及为什么深递归有爆栈风险。','**要求与边界**：depth 默认 1，0 返回浅拷贝；Infinity 无限展开；不修改原数组；空数组返回空数组；只处理数组嵌套，不展开类数组与可迭代对象。

**实现**
```js
function flat(arr, depth = 1) {
  const out = [];
  const walk = (list, d) => {
    for (const item of list) {
      if (Array.isArray(item) && d > 0) walk(item, d - 1);
      else out.push(item);
    }
  };
  walk(arr, depth);
  return out;
}

function flatByStack(arr, depth = 1) {
  const out = [];
  const stack = [];
  for (let i = arr.length - 1; i >= 0; i--) stack.push([arr[i], depth]);
  while (stack.length) {
    const [item, d] = stack.pop();
    if (Array.isArray(item) && d > 0) {
      for (let i = item.length - 1; i >= 0; i--) stack.push([item[i], d - 1]);
    } else {
      out.push(item);
    }
  }
  return out;
}
```

**关键点**
1. 递归版按深度递减，d 为 0 时不再展开，直接 push 整个子数组，这就是"指定深度"。
2. Infinity - 1 仍是 Infinity，同一个函数天然支持完全展开，不需要额外分支。
3. 栈版逆序压栈，弹出时才是正序，否则结果顺序整体反过来，这是最容易写错的地方。
4. 栈版把值与剩余深度一起入栈，用堆内存代替调用栈，深嵌套不会 RangeError，代价是每项要分配数组。
5. 与原生差异：原生 flat 跳过稀疏数组的空洞，for...of 会把空洞当成 undefined。

**复杂度与用例**：时间 O(总元素数)，空间 O(结果长度 + 嵌套深度)。用例：[1,[2,[3,[4]]]] 默认得到 [1,2,[3,[4]]]，depth=2 得到 [1,2,3,[4]]，Infinity 得到 [1,2,3,4]，两种实现结果一致。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('ef5e9a1a7f93c79367e209bc','手写一维数组转树，用 Map 做到一趟遍历 O(n)','接口返回扁平的部门列表，每项有 id 和 parentId。要求实现 listToTree：组装成嵌套树，根节点是 parentId 为空或找不到父节点的项，保持原数组顺序；要求说明时间复杂度，并指出数据量大时要注意什么。','**要求与边界**：parentId 为 null、undefined 或 0 视为根；父节点不存在时该节点也作为根，不能丢数据；保持输入顺序；不能修改原数组元素；支持自定义字段名。

**实现**
```js
function listToTree(list, idKey = ''id'', parentKey = ''parentId'') {
  const map = new Map();
  for (const item of list) map.set(item[idKey], { ...item, children: [] });
  const roots = [];
  for (const node of map.values()) {
    const parent = node[parentKey] == null ? null : map.get(node[parentKey]);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
```

**关键点**
1. 先建 Map 再做第二趟挂载，两趟都是 O(n)；如果在循环里对每项 filter 查找父节点，复杂度会退化成 O(n²)，一万条数据就是上亿次比较，这是最常见的性能事故。
2. 拷贝用的是浅展开加 children，避免污染接口返回的原始对象；如果原对象本来就有 children 字段，这里的覆盖是刻意的。
3. parentId 用 == null 同时覆盖 null 与 undefined，注意不要用 == 0，否则 id 为 0 的父节点会被误判成根。
4. 父节点不存在时归入 roots，保证脏数据不丢，这比直接丢弃更利于排查。
5. 顺序问题：Map 按插入顺序遍历，所以结果顺序与输入一致；如果业务要求子节点排序，要在挂载后统一排序，不要在循环里做。
6. 循环引用（A 的父是 B、B 的父是 A）不会报错也不会成为根，两个节点互相挂在对方 children 上，序列化时会爆栈，需要额外用访问标记检测。

**复杂度与用例**：时间 O(n)，空间 O(n)。用例：三个根节点、每个两个子节点，转换后根数组长度为 3；parentId 指向不存在的 id 时该节点出现在根数组；空数组返回 []；一万条数据在毫秒级完成。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('487f209386a64feb8df931be','手写 new 运算符，说明原型绑定与返回值判定规则','要求实现 myNew(Ctor, ...args)：创建实例、绑定原型、执行构造函数、按规则决定返回值。追问：构造函数返回对象与返回原始值分别是什么结果，箭头函数为什么不能用 new，new.target 在这里起什么作用。','**要求与边界**：实例的原型指向 Ctor.prototype；构造函数里的 this 指向实例；构造函数返回对象（含函数）时以该对象为准，返回原始值则忽略；非函数入参要报错；箭头函数与部分内置函数没有 [[Construct]]。

**实现**
```js
function myNew(Ctor, ...args) {
  if (typeof Ctor !== ''function'') throw new TypeError(''Ctor 不是构造函数'');
  const obj = Object.create(Ctor.prototype);
  const result = Ctor.apply(obj, args);
  const isObject = result !== null && (typeof result === ''object'' || typeof result === ''function'');
  return isObject ? result : obj;
}
```

**关键点**
1. Object.create(Ctor.prototype) 一步完成原型绑定，等价于 new 里设置 [[Prototype]]；不要用 obj.__proto__ = ...，那会走 setter，性能与语义都更差。
2. 返回值判定必须包含 null 判断：typeof null 是 object，漏掉会返回 null 导致后续属性访问全部报错。
3. 函数也要算对象：typeof 函数是 function，但构造函数返回函数时同样要覆盖实例，所以判断里要带上 function。
4. apply 传入空参数数组即可，没有参数时用 call(obj) 也可，但统一用 apply 更简洁。
5. 与真实 new 的差距：没有校验 Ctor 是否可构造（箭头函数、async 函数会带 prototype 缺失或抛错），没有处理 class 构造函数不能 apply 调用的限制，也没有真正设置 new.target。要模拟 new.target，可以给 Ctor 传一个特殊标记或改用 Reflect.construct(Ctor, args)，后者最接近原生语义。
6. class 场景下的正确写法是 Reflect.construct(Ctor, args)，它会走 [[Construct]]，不受 apply 限制。

**复杂度与用例**：时间 O(1) 加构造函数自身耗时。用例：普通构造函数 myNew 后 instanceof 成立、属性正确；构造函数 return {a:1} 时返回该对象而不是实例；return 1 时仍返回实例；入参不是函数时抛 TypeError。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('cfdf30ced62ac5fbb539c849','手写 instanceof，沿原型链逐层比对并处理原始值','要求实现 myInstanceof(obj, Ctor)：判断 obj 的原型链上是否存在 Ctor.prototype。追问：为什么原始值一律返回 false，Symbol.hasInstance 会怎样影响判断，跨 iframe 场景为什么会失效。','**要求与边界**：沿 [[Prototype]] 逐层向上，直到 null；原始值返回 false；obj 为 null 或 undefined 返回 false；Ctor 不是函数时抛 TypeError；不能依赖 __proto__ 属性。

**实现**
```js
function myInstanceof(obj, Ctor) {
  if (typeof Ctor !== ''function'') throw new TypeError(''右操作数不是函数'');
  if (obj === null || (typeof obj !== ''object'' && typeof obj !== ''function'')) return false;
  const target = Ctor.prototype;
  let proto = Object.getPrototypeOf(obj);
  while (proto) {
    if (proto === target) return true;
    proto = Object.getPrototypeOf(proto);
  }
  return false;
}
```

**关键点**
1. 用 Object.getPrototypeOf 而不是 obj.__proto__：后者是可以被覆盖的访问器，Object.create(null) 上也不存在。
2. 循环用 while (proto) 作为终止条件，链尾 null 时自动结束。
3. 原始值必须先拦掉：字符串和数字会装箱，不拦的话 myInstanceof(''a'', String) 会返回 true。
4. Ctor.prototype 取一次存下来，循环里反复取会触发 getter。
5. 原生走 [[Prototype]] 内部槽，还支持 Symbol.hasInstance 钩子，手写版不触发。
6. 跨 iframe 失效是因为不同 realm 的原型对象不是同一引用，这类判断要用 Array.isArray 或 toString。

**复杂度与用例**：时间 O(原型链长度)，空间 O(1)。用例：myInstanceof([], Array) 与为 Object 均为 true；null 与原始值均为 false；自定义三层原型链能命中。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('9c099b546fab0d77193ab549','手写 Promise，实现状态机与 then 链式调用并说明与 A+ 的差距','要求实现一个可用的 Promise：三种状态且只能单向流转、then 返回新 Promise 支持链式、回调异步执行、可返回 Promise 或 thenable 并被吸收、错误穿透、值穿透。要求说明它与 Promises/A+ 规范的差距，不能写伪代码。','**要求**：单向状态机；then 链式返回新实例；回调异步；thenable 被吸收；值与错误可穿透；循环引用报 TypeError。

**实现**
```js
class MyPromise {
  constructor(fn) {
    this.state = ''pending'';
    this.value = undefined;
    this.cbs = [];
    const settle = (state, value) => {
      if (this.state !== ''pending'') return;
      this.state = state;
      this.value = value;
      this.cbs.splice(0).forEach((cb) => queueMicrotask(cb));
    };
    const resolve = (v) => {
      if (v === this) return settle(''rejected'', new TypeError(''cycle''));
      if (v && typeof v.then === ''function'') return v.then(resolve, (e) => settle(''rejected'', e));
      settle(''fulfilled'', v);
    };
    try { fn(resolve, (e) => settle(''rejected'', e)); } catch (e) { settle(''rejected'', e); }
  }
  then(onOk, onFail) {
    return new MyPromise((resolve, reject) => {
      const run = () => {
        const cb = this.state === ''fulfilled'' ? onOk : onFail;
        if (typeof cb !== ''function'') return this.state === ''fulfilled'' ? resolve(this.value) : reject(this.value);
        try { resolve(cb(this.value)); } catch (e) { reject(e); }
      };
      this.state === ''pending'' ? this.cbs.push(run) : queueMicrotask(run);
    });
  }
}
```

**关键点**
1. settle 用 splice(0) 取出并清空队列，避免执行中新增的回调被重复执行。
2. resolve 的判断顺序是自引用、thenable、settle，顺序错了会重复 settle 或漏掉吸收。
3. then 必须返回新实例并把回调返回值交给它的 resolve；回调不是函数时按状态透传，即值穿透与错误穿透。

**与 A+ 的差距**：没有 catch/finally 与静态方法；thenable 取 then 属性抛错未处理；没有 unhandledrejection 通知；循环检测只覆盖直接自引用。

**复杂度与用例**：then 单次 O(1)。用例：输出顺序 sync → then1 → then2；链式 Promise 被等待；throw 被下游捕获；传 null 时透传。','手写题',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
PRAGMA foreign_keys=ON;
