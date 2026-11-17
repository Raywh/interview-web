PRAGMA foreign_keys=OFF;
-- 面试题库 seed：50 条，由 scripts/import.mjs 自动生成（勿手改，生成于 2026-11-17 23:11:41 +08:00）；单引号已按 SQL 规则转义
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('500174c9544c09e40404dd0b','浏览器事件循环里微任务在哪个时机清空，Node 的时序为什么不完全一致','面试官贴一段代码：先同步 log，再 Promise.resolve().then、queueMicrotask、setTimeout 0、以及一个 async 函数里 await 之后的 log，让你写出完整输出顺序。接着追问：如果微任务里继续产生微任务会发生什么，为什么页面会卡死却不报错；同样的代码放到 Node 里跑，结果是否一致。','**先给结论**：一个宏任务执行完、调用栈清空后，微任务队列会被一次性抽干（抽干过程中新产生的微任务也在同一轮清掉），之后才轮到渲染机会或下一个宏任务。

**执行顺序**
1. 取一个宏任务执行：整体 script 代码、setTimeout、事件回调、网络回调都属于宏任务。
2. 清空微任务队列：Promise.then、queueMicrotask、MutationObserver 回调。
3. 进入渲染机会：requestAnimationFrame → 样式计算 → 布局 → 绘制。
4. 取下一个宏任务。

因此同步代码最先，然后 then 与 queueMicrotask 按入队顺序，setTimeout 最后。0 毫秒不等于立即执行：它表示最早可以执行，还要等当前任务结束、微任务清空，浏览器对嵌套定时器还有约 4ms 的最小间隔限制。

**Node 的差异**
Node 是阶段模型：timers → pending callbacks → poll → check（setImmediate）→ close。process.nextTick 队列优先级高于 promise 微任务，两条队列在阶段切换时都会清空（Node 11 之后细化到每个回调执行完就清）。所以顶层脚本里 setTimeout(fn, 0) 与 setImmediate 的先后不确定，取决于进入 poll 阶段花了多久；但在 I/O 回调内部，setImmediate 总是先于 setTimeout。

**追问点**
- 微任务里继续 .then 会不断排队，微任务队列永不清空，渲染被饿死，表现为页面卡住但控制台安静。
- 需要长任务切片又不给渲染加压时，MessageChannel 常替代 setTimeout，因为它没有 4ms 钳制。
- rAF 只在有渲染机会时执行，适合动画；requestIdleCallback 时间片不确定，不能放必须执行完的逻辑。

**易错**
把 new Promise 里的执行器函数当成异步，其实它是同步执行的，只有 then 回调进微任务；async 函数中 await 之前的语句同步执行，await 之后的语句才进微任务。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('87b116a40146f19f9ca6db69','闭包到底保存了什么，循环里用 var 注册回调为什么会打印同一个值','给 for 循环里给按钮绑定点击事件的代码，用 var 声明索引，点击全部输出最后一个下标；要求改成正确写法并解释原理。继续追问：闭包捕获的是变量还是值，闭包会不会导致内存泄漏，什么情况下外部函数已经返回但局部变量仍然无法回收。','**闭包的定义**：函数与其词法环境的组合。只要内部函数还能被外部引用，它引用的外层作用域变量就不会被回收。注意捕获的是变量本身（同一个环境记录），不是当时的快照值。

**var 的问题**
var 只有函数作用域，循环里只有一个 i，三个回调共享同一个环境记录，点击时循环早已结束，i 停在循环退出值。改成 let 之后，每次迭代创建新的绑定（规范里叫 per-iteration environment），三个回调各自持有独立变量，输出 0、1、2。

**不改 let 的两种等价写法**
1. 立即执行函数把当前值作为参数传进去，形成新的函数作用域。
2. 用 setTimeout 的第三个参数或 bind 预先绑定值：setTimeout(fn, 0, i) 会把 i 作为实参传入。

**闭包与内存**
闭包本身不是泄漏，是正常特性。真正的问题出在"长期存活的引用指向了大对象"：
- 全局缓存、单例、事件总线里存了 DOM 节点或大数据；
- 定时器、事件监听、WebSocket 没有清理，回调闭包连带引用整棵组件树；
- 组件卸载后仍被外部数组持有。

判断标准不是"有没有闭包"，而是"这个引用还有没有可能被释放"。用 Chrome 的 Memory 面板抓两次堆快照做对比，看 Detached HTMLElement 是否持续增长最直接。

**追问：如何主动减少持有**
只捕获需要的字段，不要整个对象塞进回调；用完置空引用；需要弱引用时用 WeakMap 或 WeakRef（后者要配合 FinalizationRegistry 使用，且触发时机不确定，不适合做业务逻辑）。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('1fd65a21099641e7e7fd991a','原型链查找过程是怎样的，class 继承与寄生组合继承差在哪里','要求画出实例、构造函数、prototype、__proto__ 四者关系，并写出 new 一个对象后属性查找的完整路径。面试官继续追问：class 的 extends 在底层做了什么，super 为什么必须在 this 之前调用，用 ES5 手写继承要注意哪些点。','**四者关系**
实例的 __proto__ 指向构造函数的 prototype；prototype 的 constructor 指回构造函数；prototype 的 __proto__ 指向 Object.prototype；Object.prototype 的 __proto__ 是 null，查找在这里终止。

**属性查找路径**
先在自身属性找，找不到沿 __proto__ 向上逐层查找，直到 null 返回 undefined。方法挂在 prototype 上是为了共享，避免每个实例复制一份。in 会查整条链，hasOwnProperty 只查自身。

**class 的本质**
class 仍然是函数 + 原型链，但有几点不同：
- 只能 new 调用，直接调用抛 TypeError；
- 方法不可枚举，且没有 prototype 上的 constructor 之外多余属性；
- 内部默认严格模式；
- 必须先 super() 才能访问 this。原因是派生类的 this 由父类构造过程决定（[[Construct]] 里 this 在 super 调用后才绑定），提前访问会抛 ReferenceError。

**ES5 手写继承的要点**
1. 子类构造函数里 Parent.call(this, ...) 继承实例属性。
2. Child.prototype = Object.create(Parent.prototype) 继承原型方法，不要直接赋值 Parent.prototype，否则改子类原型会污染父类。
3. 补回 constructor 指向。
4. 静态属性用 Object.setPrototypeOf(Child, Parent) 继承。

**易错**
把 Child.prototype = new Parent() 当标准写法，会多执行一次父构造函数并带上无意义的实例属性；用 __proto__ 直接改原型在性能上不友好，也会破坏引擎对原型形状的优化。原型链过长会拖慢查找，业务里三层以上就该考虑组合替代继承。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('e410476ddb6e314d95d9410e','this 绑定的优先级怎么排，箭头函数和丢失引用的方法各是什么结果','给出五段调用：普通函数调用、对象方法调用、call/apply 调用、bind 后再 new、箭头函数定义在对象方法里。要求逐个说出 this 指向并排序优先级。接着问：把方法当回调传出去为什么会丢 this，React 类组件里为什么要 bind。','**优先级从高到低**
1. new 绑定：用 new 调用时 this 指向新创建的对象，即使之前 bind 过，new 的优先级也更高（bind 提供的参数仍然生效）。
2. 显式绑定：call、apply、bind 指定 this。
3. 隐式绑定：obj.fn() 中的 obj。
4. 默认绑定：非严格模式指向全局对象，严格模式是 undefined。

箭头函数不参与这套规则，它的 this 在定义时由外层词法作用域决定，call/bind 改不了，也不能用 new 调用（没有 [[Construct]]）。

**方法丢失 this 的原因**
把 obj.method 赋给变量或当参数传递，调用点变成普通函数调用，隐式绑定消失。常见场景：setTimeout(obj.method, 0)、事件监听、数组方法回调。修复方式有三种：箭头函数包一层、bind 绑定、或在调用处用 obj.method()。类组件里方法定义在 prototype 上，传 onClick={this.handleClick} 等价于丢失调用点，所以要么在 constructor 里 bind，要么写成箭头函数类字段。

**边界情况**
- call/apply/bind 传 null 或 undefined 时，非严格模式下 this 会被替换成全局对象（这叫装箱/替换规则），严格模式下保持原值。
- bind 多次调用只有第一次生效。
- 箭头函数里不能再用 arguments，要用剩余参数。
- 严格模式下 setTimeout 回调里的 this 是 undefined 而不是 window，这一点在排查老代码时经常踩。

**回答技巧**
先说规则表，再用一段代码验证优先级，最后补边界，比背结论更可信。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('a95c9db9693d01b13b825fc7','V8 的垃圾回收为什么分新生代和老生代，Scavenge 与标记清除各解决什么问题','面试官问：V8 里对象是怎么被判定为垃圾的，为什么要把堆分成新生代和老生代，Scavenge 的复制算法具体怎么搬，老生代的标记清除和标记整理有什么区别。继续追问增量标记、并发标记为了解决什么，以及哪些代码写法会让 GC 压力变大。','**可达性判定**
V8 用可达性分析而不是引用计数：从根（全局对象、当前调用栈、闭包环境等）出发遍历，遍历不到的对象即为垃圾。引用计数解决不了循环引用，可达性分析天然免疫。

**为什么要分代**
绝大多数对象朝生夕死（弱代假设）。新生代对象少、死亡快，用复制算法性价比最高；老生代对象多、存活率高，复制成本太大，改用标记类算法。

**新生代 Scavenge**
新生代分成两块半空间 from 和 to，新对象分配在 from。回收时把 from 中存活对象复制到 to 并按顺序紧凑排列，然后交换两块空间角色。存活对象经历一次回收仍存活（或 to 空间使用超过 25%）就晋升到老生代。复制算法不产生内存碎片，代价是只用一半空间。

**老生代**
标记清除：标记所有可达对象，清除未标记对象。问题是清除后留下大量碎片，大对象可能分配失败。标记整理：标记后把存活对象向一端移动再清理边界外内存，没有碎片但要移动对象、更新引用，速度更慢。V8 实际是两者结合，多数情况用标记清除，碎片过多时触发整理。

**停顿优化**
全量标记会长时间暂停主线程，所以有三件套：
- 增量标记：把标记拆成小步，和 JS 执行交替进行；
- 并发标记：标记线程与主线程并行；
- 惰性清理：先标记完，清理延后按需做。

**写代码时的注意点**
频繁创建大数组、闭包里持有大对象、频繁字符串拼接、无节制缓存，都会抬高 GC 频率和停顿。可以用 --max-old-space-size 调整老生代上限，但那是缓解不是解决。真正的排查手段是堆快照对比，看哪类构造函数数量在涨。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('ad6963efcab56497e012320b','WeakMap 为什么能避免内存泄漏，它和 Map 的差别只在弱引用吗','场景题：给一批 DOM 节点挂载额外数据，用 Map 存节点到数据的映射，节点被移除后内存不降。要求改成 WeakMap 并解释原因。追问：WeakMap 为什么不可枚举、键只能是对象，WeakRef 和 FinalizationRegistry 能用来做什么，为什么不适合写业务逻辑。','**核心差别**
WeakMap 的键是弱引用：键对象没有其他强引用时可以被回收，对应条目自动从表里消失，不会因为存在这个映射而阻止回收。Map 的键是强引用，只要 Map 活着，键对象就一直被持有，这就是上面场景泄漏的根因。

**为什么不可枚举、没有 size**
弱引用的可达性依赖 GC 时机，如果允许遍历，遍历结果会随 GC 时刻变化，语义上无法保证。规范干脆不提供遍历和 size，只留 get、set、has、delete。同理键必须是对象或 symbol，原始值没有"被回收"的概念。

**典型用法**
1. DOM 节点元数据：节点销毁即自动释放，不需要手动 delete。
2. 实例私有数据：把私有字段放在模块级 WeakMap 里，外部拿不到也改不了。
3. 缓存：以对象为键的派生结果缓存，键失效自动清理。
4. 标记位：记录某个对象是否已被处理，不污染对象本身。

**WeakRef 与 FinalizationRegistry**
WeakRef 提供弱引用指针，deref() 可能返回 undefined；FinalizationRegistry 在对象被回收后触发回调。两者都只适合做缓存清理、资源兜底这类"尽力而为"的事。原因：GC 时机由引擎决定，回调可能在任意时刻触发，也可能永远不触发，业务正确性不能建立在这上面。

**易错**
把 WeakMap 当普通 Map 用，想遍历就取不到；用字符串当键直接抛 TypeError；以为 WeakMap 里的值也是弱引用（值仍是强引用，只有键是弱的，值引用了键仍会造成循环但不会泄漏，因为键的弱引用不阻止回收）。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('7d874955215e8070c3ac114d','严格模式改变了哪些行为，为什么类体内和 ES 模块默认就是严格模式','给出几个在老代码里"静默失败"的例子：给未声明变量赋值、删除不可配置属性、函数参数重名、arguments 与形参联动。要求说明严格模式下分别变成什么行为。追问：为什么 class 内部和 ES 模块不需要写 use strict，混用严格与非严格代码有什么坑。','**主要变化**
1. 未声明变量赋值直接抛 ReferenceError，不再隐式创建全局变量。
2. 普通函数调用时 this 是 undefined，而不是全局对象，这让"忘了 new"的错误更早暴露。
3. 对只读属性赋值、删除不可配置属性、给不可扩展对象加属性，从静默失败变成抛 TypeError。
4. 禁止 with 语句，禁止八进制字面量，禁止 delete 变量名。
5. 函数参数不允许重名；arguments 不再与形参联动，也不再有 callee。
6. eval 里的声明不会泄漏到外层作用域。
7. 禁止在块内声明函数（早期规范如此，ES6 后块级函数声明有了明确语义）。

**为什么 class 和模块默认严格**
class 是新语法，没有历史包袱，设计上直接采用严格语义，避免 this 被替换成全局对象导致的隐性 bug；ES 模块同理，模块顶层默认严格模式，这也是模块里顶层 this 是 undefined 的原因（顺便解决了很多老脚本互相污染的写法）。

**混用的坑**
- 把非严格脚本拼进严格文件不会自动变严格，打包后行为可能与源码不同；
- 严格模式下 arguments 不与形参联动，老代码依赖这个特性的会静默出错；
- 依赖 this 指向 window 的工具函数在严格模块里会拿到 undefined。

**实践建议**
新代码一律严格（模块天然严格），迁移老代码时先用 ESLint 的 strict 规则扫一遍，重点看 this 依赖和隐式全局变量，这两类最容易在升级后爆出运行时错误。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('06c14cdc7b2390b6bc6f7197','Proxy 与 Object.defineProperty 的拦截能力差在哪，Reflect 为什么总是配套出现','要求说明 Proxy 能拦截哪些操作、defineProperty 为什么做不到，并解释 Vue 3 为什么从 defineProperty 换成 Proxy。接着追问：Reflect.get 的第三个参数 receiver 有什么用，Proxy 有哪些不可违反的不变量限制，代理对象为什么比普通对象慢。','**能力差异**
defineProperty 只能拦截属性的读取和设置（get/set），且必须事先知道属性名，所以：
- 新增属性、删除属性拦截不到，需要 Vue.set / Vue.delete 兜底；
- 数组下标赋值和 length 变化拦截不完整，只能重写数组方法；
- 无法拦截 in、Object.keys、for...in 之类的枚举与判断操作。

Proxy 是对象级别的代理，可以拦截 get、set、has、deleteProperty、ownKeys、getOwnPropertyDescriptor、defineProperty、apply、construct 等十三种内部方法，覆盖属性读写、枚举、函数调用、new 构造，天然支持新增/删除属性和数组索引。

**为什么配套 Reflect**
Reflect 提供与这些内部方法一一对应的函数，且返回布尔值而不是抛错。在 handler 里写 Reflect.get(target, key, receiver) 有两个好处：
1. 保持默认行为的语义完整，尤其是 receiver 会作为 getter 调用时的 this，避免代理链上 getter 指向错误对象；
2. 让拦截逻辑只处理差异部分，其余全部转发，减少遗漏。

**Vue 3 选 Proxy 的原因**
能监听新增/删除属性、数组索引与 length，不再需要特殊 API；惰性代理，只有真正访问嵌套对象时才递归包装，初始化开销小。代价是不支持 IE，且对原始值（number/string）无法代理，需要 ref 包一层。

**不变量与性能**
Proxy 的 trap 必须遵守不变量，例如目标对象属性不可配置时，getOwnPropertyDescriptor 不能谎报；ownKeys 不能漏掉不可配置的自有属性。违反会抛 TypeError。性能方面，代理访问要经过 trap 调用，属性访问比普通对象慢，热点路径上频繁读写同一个对象时要注意，可以对稳定数据做浅层快照而不是全程代理。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('b3884db1b940cb12f63bfac7','React Compiler 到底在编译期做了什么，为什么它要求你遵守 Rules of React','项目从手写 useMemo、useCallback、memo 迁移到开启 React Compiler，让你说明编译器的工作机制、产物形态，以及为什么团队里有人写的不规范组件在开启后出现状态错乱。追问：哪些代码会被跳过，use no memo 该在什么时候用。','**它解决什么**
React 的默认行为是父组件重渲染带动子树重渲染，优化手段一直是手写 memo、useMemo、useCallback，漏写一个引用不稳就会击穿优化。Compiler 的思路是把这件事交给编译器：分析组件与 Hook 的数据流，自动插入细粒度的缓存判断，等价于人工 memo 化，但粒度更细，能按表达式而不是按整个函数缓存。

**工作机制**
1. 在 Babel 或 SWC 插件阶段拿到每个组件/Hook 的 AST。
2. 转换到中间表示，做类型推断与数据流分析，找出哪些值在重渲染时是稳定的、哪些表达式有副作用、哪些依赖会变。
3. 生成带 memo cache 的代码：产物里能看到一个缓存数组（约定叫法 c(n)）和若干槽位比较，命中就跳过重复计算与重复创建。
4. 组件本身也会被包一层等价于 memo 的行为，但它比手写 memo 更懂 props 的实际用法。

**为什么强制 Rules of React**
编译器的正确性建立在"渲染是纯的"这个假设上：不能在渲染期改 props/state，不能读写 ref 以外的外部可变状态，Hooks 不能条件调用。一旦违反，编译器会把错误的依赖关系固化进产物，表现为状态不更新、effect 不触发、界面与数据错位。这不是编译器有 bug，而是输入本身违反了契约。

**跳过与退出**
含无法分析的语法（比如动态 eval、非常规的 Hook 使用）、或位于 node_modules 的代码默认不处理；文件或函数顶部加 "use no memo" 指令可以局部退出，适合迁移期兜底，但要当成技术债记录。

**别误解的地方**
Compiler 只优化重渲染成本，不解决"状态设计不合理导致的大范围更新"，也不减少首次渲染的计算量。把它当成免费的保底优化，而不是性能问题的万能药。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('8f65aa0aa72f0bd0445bc721','Hooks 为什么不能写在条件语句里，Fiber 上那条链表是怎么存的','给一段在 if 里调用 useState 的代码，说明为什么报错、运行时到底发生了什么。要求画出 Fiber 与 hooks 链表的结构，解释首次挂载和更新时 React 如何找到"第几个 Hook"对应的状态。追问：为什么 Hook 数量一致但顺序打乱时不一定报错，却会出现状态串位。','**存储结构**
函数组件对应的 Fiber 上，memoizedState 指向一条单向链表，每个节点是一个 Hook 对象：memoizedState 存当前状态（useState 存值，useEffect 存 effect 对象，useRef 存 ref 对象），queue 存更新队列，next 指向下一个 Hook。组件里有几个 Hook，链表就有几个节点。

**首次挂载**
React 用 mount 版 dispatcher，每次调用 useState 就新建一个 Hook 节点，追加到链表尾部，并在闭包里维护一个 workInProgressHook 指针指向当前节点。

**更新时**
React 用 update 版 dispatcher，函数组件重新执行，每遇到一个 Hook 就把指针往后移一格，从 current 树上对应的节点读取状态和队列。也就是说，React 认的不是变量名，而是"这是本次渲染的第几个 Hook 调用"。

**所以条件调用会出问题**
如果某次渲染跳过了第一个 useState，那么第二个 useState 会拿到第一个 Hook 的节点，状态被错误地复用。React 只能在 Hook 数量变化时给出明确报错（渲染的 Hook 比上次多/少），数量相同但顺序错位时它无法察觉，于是表现为莫名其妙的状态串位，比直接报错更难查。

**深层原因**
Hooks 的状态存在 Fiber 上，而不是存在函数作用域里，函数每次渲染都是全新的执行上下文。要让"无名字的状态"能被稳定定位，只能依赖调用顺序这个隐式契约。

**实践约束**
循环、条件、嵌套函数、提前 return 之后都不能调用 Hook；需要条件逻辑时把判断放进 Hook 内部，或者拆成两个组件；自定义 Hook 本质是复用了这条链表的调用顺序，所以它也必须遵守同样的规则。ESLint 的 rules-of-hooks 就是静态检查这一点，别关。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('c94133f9b6f20e7dbf24061c','useEffect 的依赖数组怎么写才不出闭包陷阱，定时器里读到旧 state 怎么办','一段计数器组件用 setInterval 每秒打印 count，结果永远打印 0；改成依赖 count 之后又变成每秒重建定时器。要求给出三种修复写法并比较取舍。追问：依赖里放对象或函数为什么每次都变，useMemo 能不能解决所有依赖问题。','**陷阱来源**
每次渲染都会创建新的函数作用域，effect 回调捕获的是"创建它的那次渲染"的 props 和 state。依赖数组为空时 effect 只执行一次，回调里读到的就是首次渲染的闭包，永远是 0。

**三种修复**
1. 函数式更新：setCount(c => c + 1) 不读外部 count，只依赖更新函数本身，依赖数组可以保持为空，定时器只建一次。
2. 用 ref 保存最新值：每次渲染把 count 写进 ref.current，effect 里读 ref.current，适合需要在回调里读多个最新状态的场景。
3. 把依赖补全并正确清理：依赖里写 count，每次变化前先 clearInterval，逻辑正确但会频繁重建定时器，适合副作用本身依赖该值的场景（比如按 id 重新订阅）。

**依赖比较规则**
React 用 Object.is 逐项比较。对象、数组、内联函数每次渲染都是新引用，放进依赖会让 effect 每次都跑。解决办法是把它们移出依赖（在 effect 内部定义）、用 useMemo/useCallback 稳定引用，或者用 ref 持有。

**不要用禁用注释糊弄**
把 exhaustive-deps 关掉只是把问题藏起来，线上表现为订阅没更新、请求参数是旧的、事件监听里拿到上一帧数据。

**清理函数的位置**
清理函数在下次 effect 执行前和组件卸载时调用，用来取消订阅、清除定时器、中断请求（AbortController）。开发环境的 StrictMode 会把挂载 effect 执行两次，用来暴露清理不彻底的问题，这不是 bug，别用 ref 标记去绕过它。

**更现代的补充**
确实需要在 effect 里读最新值又不想加依赖时，用 ref 同步或把逻辑上移到事件处理函数是更稳的做法；React 后续版本提供的 effect event 类 API 也是为解决这类需求，但属于新特性，团队要评估版本兼容。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('4628f259088aafbe33db7b61','Vue 3 用 Proxy 做响应式后，依赖收集和触发是怎么走的，3.5 优化了哪里','要求说明 reactive 包装对象后，读取属性时如何收集依赖、修改时如何触发更新，以及为什么需要 effect 栈和 cleanup。接着追问 Vue 3.5 对响应式系统做了哪些改动，props 解构为什么能保持响应式。','**依赖收集**
reactive 返回 Proxy，get 拦截时调用 track：以 target 为键存一个 Map，内层按属性名存一个 dep 集合，把当前正在执行的 effect 加进去（activeEffect 由全局栈维护，支持 effect 嵌套）。set 拦截时调用 trigger：取出该属性对应的所有 effect 执行，若值没变则跳过（用 hasChanged 比较）。

**为什么需要 effect 栈**
组件渲染过程中可能嵌套执行其他 effect（比如 computed 内部、watch 回调），activeEffect 必须是栈结构，执行完要恢复上一层，否则依赖会被错误地收集到外层 effect 上。

**cleanup 的作用**
一个 effect 每次重新执行前要清除上一次收集的依赖，否则条件分支切换后，旧分支的依赖仍然挂着，会造成不必要的重复触发。Vue 3 用依赖的双向链表记录，重新收集时对比新旧集合做增删。

**Vue 3.5 的变化**
响应式系统做了底层重构：依赖关系从"每个属性挂一个 Set"改成基于双向链表的 Link 结构，并引入版本计数来跳过重复的 trigger。官方给出的数据是内存占用明显下降（约五成量级），大数组的追踪与触发也更快。另外 props 解构在 3.5 起默认保持响应式，不再需要 toRefs；新增了 useTemplateRef、useId、onWatcherCleanup，watch 的 deep 支持传入数字表示监听层级。3.4 的重点则在模板解析器重写与 SSR hydration 不匹配检测，两者不要混着答。

**追问：为什么 ref 需要 .value**
Proxy 只能代理对象，原始值无法拦截。ref 用一个带 value 属性的对象包一层，get/set 走的是同一个 track/trigger；模板里自动解包是编译期的语法糖，setup 里返回的 ref 在模板中会自动取 .value。

**易错**
reactive 对象解构会丢响应式（解构拿到的是一次性求值的原始值），要用 toRefs；把 ref 放进 reactive 数组里不会自动解包；Proxy 无法拦截原始值，所以 count++ 这种直接改基本类型的场景必须用 ref。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('10bf2951755a75cc4da6d57d','diff 算法里 Vue 的最长递增子序列和 React 的 lastPlacedIndex 差在哪','给一个乱序列表从 A B C D 变成 D A B C 的例子，要求分别说明 Vue 3 和 React 会移动几个节点、为什么。接着追问：key 用 index 会引发什么问题，Vue 什么时候退化成不使用 LIS 的路径。','**共同前提**
同层比较、类型不同直接替换、靠 key 判断是否可复用。都不做跨层级比较，因为把树 diff 降到 O(n) 的前提就是放弃跨层移动的最优解。

**Vue 3 的 keyed diff**
1. 头头对比、尾尾对比，快速处理前后缀相同的情况。
2. 处理完剩下中间段：新节点多则挂载，旧节点多则卸载。
3. 剩余乱序部分建立"新索引 → 旧索引"的映射数组，对它求最长递增子序列。LIS 上的节点保持不动，其余节点只做移动。这样移动次数等于"不在 LIS 中的节点数"，是最小移动集合。

**React 的 keyed diff**
两轮遍历：从头对比、从尾对比；剩余节点用 Map 建 oldKey → fiber 的索引，再遍历新列表。维护一个 lastPlacedIndex，遇到可复用旧节点时，若它的旧索引小于 lastPlacedIndex 就标记移动，否则只更新 lastPlacedIndex。

**差异的本质**
React 采用"向右插入"的贪心策略，只保证相对顺序正确，不追求最少移动次数。D A B C 这种把尾部节点挪到头部的情况，React 会把 A B C 三个都标记移动（因为它们都在 D 之后），而 Vue 通过 LIS 只移动 D 一个。React 的取舍是算法更简单、常数更小，而且在真实列表里大范围乱序并不常见。

**key 用 index 的问题**
列表插入或删除后，index 对应的元素变了，React/Vue 会把旧 fiber 复用到错误的数据上：受控输入框内容错位、组件内部状态（展开态、滚动位置）跟着串、动画错乱。稳定 id 才能让复用正确。仅当列表纯静态渲染、不排序不增删时才可以用 index。

**Vue 的例外路径**
列表长度不变且都在同一层时走 LIS 优化；有新增/删除混合时先处理长度差，再对剩余部分求 LIS。如果列表很小，LIS 的额外开销可能不划算，但实现上并未针对长度做短路，所以超长列表要配合虚拟滚动，别指望 diff 兜底。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('07ac914120b41442980fec23','Fiber 的可中断渲染是怎么实现的，为什么 commit 阶段不能被打断','要求解释 React 15 的栈调和为什么会卡顿、Fiber 用链表解决了什么。接着追问：时间片多长、中断后如何恢复、为什么 render 阶段可以被丢弃重做而 commit 不行，以及优先级是怎么参与调度的。','**问题的起点**
React 15 的递归调和一旦开始就无法暂停，长列表或复杂组件树会长时间占用主线程，用户输入和动画被阻塞，表现为掉帧、点击无响应。递归调用栈由引擎管理，外部无法中断。

**Fiber 的解法**
把递归改成基于链表的循环遍历，每个 Fiber 节点保存 child、sibling、return 三个指针，遍历过程变成"取下一个工作单元 → 处理 → 再取下一个"的 while 循环，循环体可以随时 break。这样就把不可中断的递归变成了可中断的迭代。

**时间片与让出**
调度器按约 5ms 的切片工作，每处理完一个工作单元检查是否超时（shouldYield），超时就交还主线程，让浏览器处理输入和渲染，下一个空闲时段再继续。这就是所谓的时间切片。

**中断后如何继续**
中间结果保存在 workInProgress 树上，root 上有指针指向它，恢复时从上次的位置继续，不需要从头再来。如果期间来了更高优先级的更新，React 会从 root 重新开始，但已经完成且 props/state 未变的子树可以通过 bailout 跳过，代价可控。

**render 与 commit 的区别**
render 阶段（beginWork/completeWork）只计算，不碰真实 DOM，所以可以暂停、丢弃、重做，多次执行也不会让界面出现中间态。commit 阶段要把变更一次性应用到 DOM，包含 beforeMutation（读取快照）、mutation（增删改、执行 componentWillUnmount）、layout（执行 componentDidMount、useLayoutEffect、更新 ref）。如果在这里暂停，用户会看到半成品界面，ref 和 DOM 也可能不一致，所以 commit 是同步且不可中断的。

**优先级**
更新被分配 lane，调度器按过期时间排序，交互类更新优先级高、可打断低优先级的渲染。这也是 useLayoutEffect 必须快的原因：它在 commit 阶段同步执行，阻塞时间直接体现在首帧。

**代价**
可中断意味着 render 可能执行多次，渲染函数必须是纯的；这也是 StrictMode 双调用的由来。并发特性不能让 CPU 计算变快，只是让长任务不再独占主线程。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('46e7bbfa7d58708c5c2294c3','React 18 的自动批处理边界在哪，什么情况下 setState 会同步刷新','一段在 setTimeout 和 Promise.then 里连续调用三次 setCount 的代码，问 React 17 与 18 分别渲染几次。接着追问：flushSync 什么时候必须用，批处理与优先级、useState 的函数式更新之间是什么关系。','**批处理是什么**
同一个事件循环内多次 setState 合并成一次渲染，避免中间态带来的重复计算与重渲染。

**React 17 及以前**
只在 React 管理的事件回调（合成事件）和生命周期里批处理。setTimeout、Promise.then、原生 addEventListener 里的多次 setState 会各自触发一次渲染，因为这些调用不在 React 的调用栈里，batchedUpdates 标记没有生效。

**React 18 起**
createRoot 启用自动批处理，所有场景都合并，包括定时器、Promise、原生事件。实现上不再依赖"是否在 React 调用栈里"，而是把更新放进 lane 队列，通过微任务统一调度一次渲染。所以上面那段代码在 18 里只渲染一次。

**会同步刷新的情况**
1. flushSync 包裹的更新：强制同步执行渲染并刷新 DOM，常用于需要立刻读取布局的场景，比如弹层出现后马上测量尺寸、图表重绘前同步状态。
2. 离散事件（点击、输入）里的更新会以高优先级同步处理，保证输入反馈及时，但同一事件内的多次更新仍然合并。

**与优先级的关系**
批处理不是无脑合并：不同 lane 的更新可能分几次渲染，高优先级先出结果，低优先级（transition）可以被更晚的更新合并或丢弃重做。用 startTransition 标记的更新会走可中断的低优先级路径。

**函数式更新的必要性**
批处理下连续 setCount(count + 1) 三次只会加 1，因为三次读到的都是同一份快照。要累加必须用 setCount(c => c + 1)，让更新基于队列里上一个结果计算。

**易错**
在 render 期间调用 setState 会触发额外一轮渲染甚至死循环；把 flushSync 用在循环里会成倍放大同步渲染开销，只在确实需要读 DOM 的边界上用。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('43fc1e1b440984a6c6dac97d','Vue 和 React 的组件通信方式该怎么选，Context 的性能坑在哪里','中后台项目里出现 props 逐层透传七八层、Context 一改全页重渲染的问题，要求给出通信方案选型矩阵。接着追问：Vue 的 provide/inject 与 React 的 Context 在更新粒度上有什么本质差别，什么时候必须上状态库。','**先按维度拆问题**
1. 层级深度：一层用 props，两三层可以接受透传，更深就该换机制。
2. 更新频率：低频（主题、用户信息）适合 Context/provide，高频（表单输入、拖拽坐标）不适合。
3. 作用域：只影响一个子树还是全局。
4. 跨框架/跨应用：微前端场景只能用事件总线或 postMessage。

**React 侧**
- props：显式、可类型检查、易调试，超过三层就开始污染中间组件。
- Context：适合低频全局状态。坑在于 value 变化会让所有消费者重渲染，且没有选择器机制。缓解手段：拆成多个 Context、value 用 useMemo 稳定引用、把消费下沉到真正需要的小组件。
- 状态库（Zustand、Jotai、Redux Toolkit）：支持按字段订阅、外部存储、DevTools，适合高频、跨页面共享的复杂状态。
- 事件/发布订阅：适合一次性通知（弹窗、埋点），不适合当状态源。

**Vue 侧**
- props/emit 是主力，v-model 本质是 props + update 事件的语法糖。
- provide/inject 解决深层透传，但注入的是引用，修改仍要走响应式对象；它不是响应式的"订阅优化"，而是"跳层传递"。
- Pinia 提供模块化、DevTools、TS 推导，是中大型项目的默认选择。
- mitt 之类的事件总线适合跨组件通知。

**本质差别**
React 的 Context 依赖引用比较，value 一变整棵子树消费点都要重新渲染，优化要靠拆分和 memo；Vue 的 provide/inject 传递的是响应式对象本身，依赖收集发生在属性级别，读取哪个字段就只订阅哪个字段，天然粒度更细。所以 Vue 里深层注入一个 reactive store 通常没有性能问题，React 里同样写法会炸。

**选型结论**
组件内部用 props；跨层级低频用 Context/provide；跨页面高频或需要持久化、需要 DevTools 的用状态库；跨应用用消息通道。先想清楚"这个状态归谁所有、多久变一次"，再选工具，比直接上状态库更能避免过度设计。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('40d2fa1687c4bc742707435c','HTTP/2 的多路复用解决了什么，为什么它还是躲不开队头阻塞','面试官问：一个页面要加载几十个资源，HTTP/1.1 时代怎么优化、HTTP/2 之后哪些优化反而有害。要求说明二进制分帧、流与多路复用的关系，以及为什么丢一个 TCP 包会让所有流一起等。追问：域名分片、雪碧图在 HTTP/2 下还要不要做。','**HTTP/1.1 的瓶颈**
一条 TCP 连接上请求串行，浏览器只能靠开多个连接（同域一般 6 个）绕过。于是有了域名分片、雪碧图、资源内联、合并打包这些手段，本质都是减少请求数、绕开连接数限制。

**HTTP/2 的改进**
1. 二进制分帧：把报文拆成带 stream id 的帧，收发交错进行，不再依赖文本分隔符。
2. 多路复用：一条连接上并发多个流，每个流内部有序、流之间互不阻塞，应用层的队头阻塞消失。
3. HPACK 头压缩：静态表 + 动态表，重复的头字段只传索引，显著减少小请求的开销。
4. 流优先级与服务端推送（推送已被主流浏览器移除，不要再当优点讲）。

**残留的队头阻塞**
多路复用共享同一条 TCP 连接，而 TCP 保证字节流有序交付。一旦某个包丢失，后续所有包都要在内核缓冲区等待重传，所有流一起被拖住。丢包率越高，HTTP/2 的表现可能比 HTTP/1.1 的多连接更差，因为以前多个连接里只有一条受害。

**所以优化策略要改**
- 域名分片有害：多开连接意味着多份拥塞控制和 TLS 握手，反而降低复用收益。
- 打包成超大 bundle 有害：缓存粒度变粗、首屏要等整包，应该按路由和改动频率切分。
- 雪碧图、内联小图收益下降，HTTP/2 下小请求的额外开销本来就小。
- 真正有效的还是减少首屏关键资源、提高缓存命中率、用 preload 提升关键资源优先级。

**追问的回答角度**
HTTP/3 把可靠传输从 TCP 移到 QUIC，每个流独立重传，才真正解决传输层队头阻塞。这属于协议栈的替换，不是应用层优化能弥补的。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('d52b12cab55daa1a94cf3682','HTTP/3 为什么基于 UDP 重造一套可靠传输，而不是改造 TCP','要求解释 QUIC 的核心机制：连接建立、流、重传、连接迁移分别怎么实现。接着追问：既然 UDP 不可靠，QUIC 自己做的可靠传输和 TCP 差在哪，为什么说 TCP 已经"改不动了"，以及部署 HTTP/3 的现实成本。','**为什么不用 TCP**
TCP 的实现在操作系统内核里，升级意味着升级全世界的内核和中间设备。大量防火墙、NAT、负载均衡对 TCP 的行为有硬编码假设，新 TCP 选项经常被丢弃或改写，这就是所谓的协议僵化。UDP 是一个几乎裸的传输层，QUIC 在其上实现可靠性、拥塞控制、加密，全部在用户态，浏览器和服务器发个版本就能迭代，部署速度完全不同。

**QUIC 的关键机制**
1. 建立连接：传输握手与 TLS 1.3 合并，首次 1-RTT，会话恢复可 0-RTT。相比 TCP+TLS 的两到三次往返，首包延迟明显降低。
2. 流与多路复用：流由 QUIC 自己管理，某个流丢包只阻塞该流，其他流照常交付，从根上消除传输层队头阻塞。
3. 重传与拥塞控制：包号单调递增（不像 TCP 复用序号，避免重传歧义），ACK 带确认延迟信息，拥塞控制可插拔，常见实现有 Cubic、BBR。
4. 连接迁移：连接用 connection id 标识而不是四元组，手机从 Wi-Fi 切到蜂窝网络时连接不中断。
5. 默认加密：不仅负载，连传输层元数据也加密，中间设备更难干预，也顺带减少了握手暴露的信息。

**代价与限制**
UDP 在部分企业网络和运营商链路被限速或封禁，需要回退到 HTTP/2；CPU 开销高于内核态 TCP（用户态处理 + 加密）；抓包分析变难；服务端要维护两套协议栈。所以现实做法是同时监听 HTTP/2 与 HTTP/3，通过 Alt-Svc 告知浏览器可用，让客户端择优。

**别答错的地方**
QUIC 不是"不可靠但更快"，它自己实现了可靠传输；HTTP/3 也不是简单地把 HTTP/2 换个传输层，头部压缩改用 QPACK，解决了 HPACK 在乱序流上的依赖问题。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('8b592c6cce798d0639947e9c','preload、prefetch、preconnect、dns-prefetch 各管什么，优先级怎么排','页面首屏依赖一个字体文件和一个第三方 CDN 上的关键脚本，同时下一个路由会用到一批图片。要求给出这四种资源提示的使用方案，并说明为什么 preload 用错反而拖慢首屏。追问：preload 加了但控制台报警告是什么意思，crossorigin 写错会怎样。','**按用途区分**
- preload：当前页面马上要用、但浏览器发现得晚的资源。浏览器提前以高优先级发起请求，不阻塞 onload，关键 CSS、字体、首屏大图、首屏必需的 JS 都适合。
- prefetch：下一次导航可能用到的资源，优先级最低，浏览器空闲时下载进 HTTP 缓存，跨页面有效。适合预取下一个路由的 chunk。
- preconnect：提前完成 DNS + TCP + TLS 握手，用于确定会用到的第三方源（CDN、字体服务、接口域名）。
- dns-prefetch：只做 DNS 解析，开销极小，用于不确定是否连接、但可能访问的域名。

**优先级大致排序**
preload 属于当前导航的最高优先级提示，会参与资源调度；preconnect 与 dns-prefetch 不抢带宽，只提前建立通道；prefetch 最低，在空闲时才跑。实际优先级还要看资源类型和浏览器实现，preload 一个 as="style" 的样式表就比图片更靠前。

**常见错误**
1. preload 了但没在页面里用到，浏览器会警告 "preloaded but not used"，白占带宽，还会挤掉真正关键的请求。
2. as 写错或不写，导致优先级判定错误、无法复用预加载的响应，甚至二次下载。
3. crossorigin 不匹配：字体、fetch 类资源必须是 CORS 模式，preload 加了 crossorigin 而实际请求没加（或反过来），缓存键不同，等于请求两次。
4. preconnect 开太多：每个都要占用连接和 TLS 握手开销，控制在三四个真正关键的源。

**落地方案**
字体：preload 加 crossorigin；首屏关键 CSS：内联或 preload；第三方 CDN：preconnect，配合 dns-prefetch 兜底；下个路由：在首屏稳定后（比如空闲回调里）再注入 prefetch，避免和首屏抢带宽。

**判断标准**
任何资源提示都要能回答"它是不是当前这次的瓶颈"，回答不了就别加。加完用性能面板对比 LCP 和带宽竞争情况，而不是凭感觉。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('b52cf9df70654b77eaa52726','强缓存和协商缓存怎么配合，发布新版本后用户为什么还在用旧代码','线上发版后部分用户白屏或报错，排查发现 HTML 被强缓存、JS 文件名带 hash 却仍是旧引用。要求说明两类缓存的判定流程、常用响应头组合，以及这套发版缓存策略应该怎么设计。追问：no-cache 和 no-store 有什么区别，为什么会话里点后退还能看到旧页面。','**判定流程**
1. 先看强缓存：Cache-Control 的 max-age / s-maxage 未过期，直接用本地副本，不发请求（Network 面板显示 from disk cache 或 from memory cache）。
2. 强缓存过期或标记为需要验证，进入协商缓存：带 If-None-Match（对应 ETag）和 If-Modified-Since（对应 Last-Modified）发请求。
3. 服务端判断未变化返回 304，响应体为空，浏览器复用本地副本；变化了返回 200 和新内容。

**优先级**
Cache-Control 高于 Expires（Expires 是绝对时间，受客户端时钟影响，已被淘汰）；ETag 优先于 Last-Modified（后者只有秒级精度，且文件在秒内多次修改无法识别）。

**关键指令的区别**
- no-cache：可以缓存，但每次使用前必须向服务端验证，等价于"必须走协商"。
- no-store：完全不缓存，连响应头都不留，用于敏感数据。
- max-age=0 与 no-cache 效果接近，但语义不同。
- immutable：告诉浏览器在这个有效期内连刷新都不要验证，适合带 hash 的静态资源。

**发版策略**
HTML 必须 no-cache（或 max-age=0 配合 ETag），保证每次拿到最新引用；带内容 hash 的 JS/CSS 设 max-age 一年加 immutable，文件名变了自然是新请求；不带 hash 的资源用较短的 max-age。这就是"入口不缓存、静态资源长缓存"的组合。

**白屏的常见成因**
HTML 被 CDN 或浏览器缓存了旧版本，里面引用的 hash 文件已被新版本覆盖删除，请求 404，页面挂掉。补齐手段：CDN 刷新入口 HTML、保留上一版本的静态资源一段时间、用 service worker 时注意缓存更新策略。

**关于后退**
来回前进后退看到旧页面，多半是往返缓存（bfcache）在起作用，页面被冻结而不是重新请求。它和 HTTP 缓存是两套机制，用 pageshow 事件的 persisted 属性可以判断，需要在恢复时刷新数据的场景要监听这个事件。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('8dc752421287c851ae5f4bf8','跨域请求为什么会先发 OPTIONS，预检通过与否分别发生了什么','前端调用另一个域名的接口，GET 正常但 POST 带自定义头就报跨域错误。要求解释简单请求与预检请求的判定条件、预检的请求响应头，以及带 cookie 时的额外限制。追问：为什么说预检失败时服务端可能已经收到了业务请求。','**同源与跨域**
协议、域名、端口三者任一不同即跨域。跨域是浏览器的限制，请求本身可能已经发出并被执行，只是响应被拦截不给 JS 读，所以"跨域报错"不等于"服务端没收到"。

**简单请求的三个条件**
方法是 GET、HEAD 或 POST；头字段只允许安全列表内的（Accept、Accept-Language、Content-Language、Content-Type 等）；Content-Type 只能是 text/plain、multipart/form-data、application/x-www-form-urlencoded。三者全满足才不发预检，直接发请求，靠响应头里的 Access-Control-Allow-Origin 决定是否放行。

**预检流程**
不满足上述条件时，浏览器先发 OPTIONS，带 Access-Control-Request-Method 和 Access-Control-Request-Headers。服务端要回：
- Access-Control-Allow-Origin：具体源或 *（带凭证时不能是 *）
- Access-Control-Allow-Methods：允许的方法
- Access-Control-Allow-Headers：允许的自定义头
- Access-Control-Max-Age：预检结果缓存时长，减少 OPTIONS 次数
- Access-Control-Allow-Credentials：true 才能携带 cookie

**带凭证的额外限制**
前端要设 credentials: ''include''（或 XHR 的 withCredentials），服务端 Allow-Origin 不能是通配符，必须是具体源，且要加 Vary: Origin 避免 CDN 把 A 站的响应给 B 站。Cookie 本身还要满足 SameSite 规则。

**关于"服务端已经收到"**
简单请求是先发后判，服务端确实执行了；预检失败时业务请求不会发出，但如果预检通过、实际请求返回的 Allow-Origin 不匹配，业务请求已经执行完才被浏览器拦下。所以写接口时不要依赖跨域策略做安全边界，鉴权必须在服务端做。

**工程上的做法**
开发环境用代理把请求转发到同源，绕开浏览器限制；生产环境在网关统一配置 CORS 白名单并处理 OPTIONS；减少自定义头可以避免预检，比如把自定义鉴权头换成 Cookie 或放在 body 里（视安全要求而定）。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('2422bb20920be06ceb0f1c66','Cookie 的 SameSite 三个值分别影响什么，登录态丢失怎么排查','一个系统嵌在第三方 iframe 里，升级浏览器后登录态频繁失效；另一个系统用跨站表单 POST 提交回调。要求分别说明 SameSite 设为 Strict、Lax、None 的表现，并给出修复方案。追问：SameSite 能替代 CSRF 防护吗。','**三个值的语义**
- Strict：任何跨站请求都不带 cookie，包括从外部链接点进来的顶级导航。最安全，但用户从搜索引擎或别的站点点进来时会显示未登录，体验差。
- Lax：默认值（主流浏览器自 Chrome 80 起把未声明的 cookie 当 Lax）。跨站的顶级导航且是安全方法（GET）时携带 cookie；iframe、图片、脚本、表单 POST 等子资源请求不带。
- None：显式允许跨站携带，必须同时加 Secure，否则浏览器直接拒绝写入。

**两个场景的诊断**
1. iframe 内登录态失效：iframe 里的请求属于跨站子资源，Lax 不带 cookie。要么把 cookie 设成 SameSite=None; Secure，要么改用 token 放在请求头里，要么让嵌入方和父页面同站（同 registrable domain）。
2. 跨站 POST 回调丢登录态：POST 不属于 Lax 允许的安全方法，cookie 不发送，服务端认为是未登录。可以让回调改用 GET 跳转再转 POST，或对这条路径使用一次性签名 token 而不是依赖 cookie。

**排查步骤**
先看请求头里有没有 Cookie 字段（没有就是没发，不是服务端问题）；再看响应头 Set-Cookie 的 SameSite 与 Secure 是否符合当前协议；注意 http 下写 Secure cookie 会被丢弃；跨站场景检查是否被第三方 cookie 策略拦截（浏览器对第三方 cookie 的限制越来越严，SameSite=None 也不保证可用）。

**能不能替代 CSRF 防护**
不能完全替代。Lax 已经挡住了大部分跨站 POST 和子资源请求，但顶级 GET 导航仍会带 cookie，所以写操作绝不能用 GET；同时应叠加 CSRF token 或校验 Origin/Referer，敏感接口再加二次确认。SameSite 是纵深防御的一层，不是唯一一层。

**实践建议**
默认 Lax；确实需要跨站的场景显式 None + Secure，并把使用范围限制到必要的 cookie；把会话 cookie 设 HttpOnly 防 XSS 读取；同一站点内不同子域共享用 Domain 明确声明，别依赖默认值。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('7af3e106a50d959d1ae9d2c9','localStorage 和 IndexedDB 该怎么选，为什么大缓存不适合放 localStorage','需求是把接口返回的上万条字典数据和用户草稿缓存到本地，要求给出存储方案并说明理由。接着追问：localStorage 的同步特性会带来什么后果，IndexedDB 的事务和索引怎么用，service worker 里能访问哪些存储。','**localStorage 的特性**
键值都是字符串，容量约 5MB（各浏览器有差异），同步 API 直接读写磁盘和内存映射，没有索引、没有事务、不能存二进制。读取一次大 JSON 并 JSON.parse，会阻塞主线程，数据量上来后首屏明显变慢。它适合小体积、需要同步读取的配置，比如主题、语言、一次性标记。

**sessionStorage 的区别**
生命周期跟标签页绑定，关闭即清空，不跨标签共享。适合表单临时态、单次流程数据。

**IndexedDB 的特性**
异步 API（事件或 Promise 包装），基于事务，支持索引、游标、范围查询，容量按磁盘配额走（通常几百 MB 起），用结构化克隆存储，可以直接存 Blob、ArrayBuffer、Date、Map 等，能在 Worker 里使用。适合大量结构化数据、离线缓存、文件缓存、需要按条件查询的场景。

**选型结论**
上万条字典数据放 IndexedDB，建索引按 key 查询，避免每次全量反序列化；用户草稿如果只有几 KB 且需要同步读取，localStorage 更简单，超过百 KB 就迁到 IndexedDB。Cookie 只放会话标识，不要放业务数据。

**使用 IndexedDB 的注意点**
1. 版本升级在 onupgradeneeded 里创建对象仓库和索引，版本号只能升不能降。
2. 事务有生命周期，await 一个无关的异步操作会让事务自动提交，导致后续操作报错，所以要把同一事务内的操作连续排队。
3. 大批量写入要分批提交，单个事务太大容易长时间占锁。
4. 需要跨标签同步时监听 BroadcastChannel 或 storage 事件。

**Service Worker 里能访问什么**
可以访问 IndexedDB 和 Cache Storage（存请求响应），不能访问 localStorage（没有 DOM 环境，同步 API 不可用）。所以离线方案要基于 Cache Storage 与 IndexedDB 设计。

**容量与清理**
存储配额是"尽力而为"的，浏览器在磁盘紧张时会清理，重要数据要能重新拉取；可以用 StorageManager.estimate 查用量，用 persist 申请持久化，但不要假设一定成功。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('72b6953111580c77a6e2cebf','从 HTML 到像素，浏览器渲染流水线每一步在做什么，哪些操作代价最高','要求完整讲出解析、样式计算、布局、绘制、合成各阶段，并说明修改 width、background-color、transform 分别触发哪些阶段。接着追问：什么情况会创建合成层，图层越多越好吗，为什么读写交替会引起布局抖动。','**流水线**
1. 解析：HTML 生成 DOM，CSS 生成 CSSOM。两者都阻塞渲染，脚本还会阻塞 DOM 构建（除非 async/defer）。
2. 样式计算：为每个节点匹配规则、计算层叠后的最终样式，得到渲染树（只含可见节点）。
3. 布局（layout/reflow）：计算每个盒子的几何位置与尺寸，输出布局树。这一步开销与节点数量、层级深度正相关。
4. 绘制（paint）：把每个元素的视觉信息（背景、边框、文字、阴影）记录成绘制指令，通常按图层分别绘制。
5. 合成（composite）：把图层交给 GPU 合成上屏。

**不同属性触发的阶段**
- 改 width、height、margin、font-size：样式 → 布局 → 绘制 → 合成，代价最高。
- 改 background-color、box-shadow、visibility：跳过布局，样式 → 绘制 → 合成。
- 改 transform、opacity：只走合成，代价最低，这是动画优先用 transform 的原因。

**合成层**
满足条件会提升为独立图层：3D transform、will-change 指定 transform/opacity、video/canvas、position: fixed 的特定情况、滤镜等。图层独立意味着改动只重绘该层，但每层都要占显存，层数过多会导致内存暴涨、合成开销上升，反而更慢。用完 will-change 要及时移除。

**布局抖动（layout thrashing）**
同一帧内交替读取几何属性（offsetWidth、getBoundingClientRect、scrollTop）和写入样式，会强制浏览器提前同步布局。在循环里写一行读一行，就会触发 N 次布局。解法是读写分离：先把要读的值批量读完，再统一写，或者用 requestAnimationFrame 分帧。

**优化落点**
减少 DOM 数量与嵌套（布局成本的主因）；动画只用 transform/opacity；避免逐帧改样式，用 class 切换；长列表用虚拟滚动；用 content-visibility: auto 让屏幕外内容跳过渲染；用 contain 限制布局影响范围。这些手段都能对应到流水线的某一阶段，回答时说清对应关系比罗列名词更有说服力。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('d41e08ee55ef6906696c936b','BFC 是什么，除了清除浮动它还能解决哪几类布局问题','给一个父元素里放浮动子元素导致高度塌陷、相邻兄弟 margin 合并、以及文字环绕浮动图片的三个例子，要求都用 BFC 解决。接着追问：BFC 的触发条件有哪些，display: flow-root 为什么是更干净的写法，BFC 和层叠上下文是不是一回事。','**定义**
块级格式化上下文是一块独立的渲染区域，内部盒子的布局不影响外部，外部的浮动也影响不到内部。它更像一种"隔离容器"，规范化并没有把它做成一个可以显式声明的属性，只能通过触发条件间接获得。

**触发条件**
根元素；float 不为 none；position 为 absolute 或 fixed；display 为 inline-block、table-cell、table-caption、flow-root、flex、grid 及其子项；overflow 不为 visible；contain 为 layout、paint、strict；column-span 为 all。工程上最稳妥的是 display: flow-root，它专为"创建 BFC 且不引入其他副作用"而设计。

**三个典型应用**
1. 高度塌陷：父元素只有浮动子元素时高度为 0，给父元素加 flow-root 后，BFC 在计算高度时会把浮动子元素纳入，塌陷消失。相比 clearfix 伪元素，不需要额外节点也不污染样式。
2. 相邻兄弟 margin 合并：同一个 BFC 内相邻块级元素的上下 margin 会合并取较大值。给其中一个包一层 BFC 容器即可阻止合并。父子 margin 穿透同理，父元素形成 BFC 后就不会与子元素的上 margin 合并。
3. 文字环绕：浮动元素后面的块级盒子会与浮动重叠，但行内内容会绕开。若希望右侧内容整体不被浮动覆盖，给右侧容器加 overflow: hidden 或 flow-root 形成 BFC，BFC 的区域不会与浮动元素重叠，从而得到两栏自适应布局。

**和层叠上下文的关系**
不是一回事。BFC 管的是布局流，层叠上下文管的是绘制顺序。但两者有交集：某些属性（如 contain、filter）会同时触发两者，这也是很多人混淆的原因。判断依据要看它影响的是位置还是遮挡关系。

**注意**
overflow: hidden 虽然能触发 BFC，但会裁剪溢出内容（下拉菜单、tooltip 被切掉），还可能导致滚动容器行为变化，所以能用 flow-root 就别用它。IE 时代用 zoom: 1 的兼容写法现在已经没有意义。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('0accf3663f1faeccf0ab6236','图片高度不确定的瀑布流怎么实现，几种方案各自的取舍是什么','商品流要求双列瀑布流，图片高度不一致且要支持无限滚动加载。要求对比多列布局、绝对定位、Grid 三种实现，说明高度测量时机与容器高度如何维护。追问：图片还没加载完怎么避免布局跳动。','**方案一：CSS 多列**
column-count 加 break-inside: avoid。代码最少，但排列顺序是纵向填满一列再填下一列，视觉和 DOM 顺序不一致；新数据插入会导致整列重排；列高难以均衡。只适合静态展示。

**方案二：flex 分列**
先按列数创建 N 个纵向 flex 容器，把数据轮流塞进去。顺序可控，但无法根据内容高度动态平衡，某一列图片都很高时会明显长短腿。改进版是每插入一个就放进当前最矮的列，这就需要 JS 测量高度，已经退化成方案三。

**方案三：绝对定位（经典实现）**
1. 容器 position: relative，每个卡片 position: absolute，宽度固定。
2. 维护一个长度为列数的数组记录每列当前累计高度，初始为 0。
3. 每次插入：找高度最小的列下标 i，设置 left = i * (宽度 + 间距)，top = 该列当前高度，然后把该列高度加上卡片高度与间距。
4. 容器高度取列高最大值，随插入更新，保证滚动条正确。
复杂度是 O(n × 列数)，列数很小可以视为 O(n)。缺点是脱离文档流，需要自己处理高度、动画和可访问性顺序。

**方案四：Grid 加行跨度**
设置 grid-auto-rows: 一个很小的行高（比如 8px）、grid-auto-flow: row dense，每个卡片测量高度后设置 grid-row-end: span N，N = ceil(卡片高度 / 行高)。好处是仍在正常文档流里，不需要绝对定位，容器高度自动撑开；缺点是要先测量再设置跨度，首帧可能出现一次跳变，且 dense 只影响填充位置，视觉顺序可能与 DOM 顺序不一致。

**高度测量与跳动**
图片高度未知时，最有效的办法是后端返回宽高比，前端用 aspect-ratio 或 padding-top 百分比预留占位，加载完成后高度不变，天然不跳动。如果只能测量，用 ResizeObserver 监听卡片尺寸变化（覆盖图片加载完成、字体加载完成、内容折行的情况），变化后重算该卡片的 top 和后续列高。不要用 window.onload 一次性测量，懒加载进来的图片会让它失真。

**无限滚动的衔接**
新数据追加时从当前列高继续累加，不要重排已有卡片；同时用 IntersectionObserver 监听底部哨兵元素触发加载，并做节流与"加载中"锁，避免重复请求。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('6dc01ed36209f1578c1bca4a','层叠上下文是怎么形成的，z-index 为什么有时候完全不起作用','一个弹层组件写在有 transform 的父容器里，z-index 设成 9999 仍然被别的模块盖住。要求解释层叠上下文的形成条件、层叠顺序的七个层级，并给出定位这个问题的思路。追问：position: fixed 为什么在这个容器里变成相对定位了。','**形成条件**
根元素；position 为 relative/absolute 且 z-index 不为 auto；position 为 fixed 或 sticky（无论 z-index）；opacity 小于 1；transform、filter、perspective、backdrop-filter 不为 none；isolation: isolate；mix-blend-mode 不为 normal；will-change 指定了上述属性；contain 为 paint 或 layout 等；flex/grid 子项且 z-index 不为 auto。

**核心规则**
z-index 只在同一个层叠上下文内部比较。父元素一旦形成层叠上下文，子元素的 z-index 再大也跳不出父元素的层级，只能和父元素的兄弟在同一个平面上比。这就是"9999 被盖住"的根本原因：弹层的祖先是一个层级更低的层叠上下文，它的整棵子树的绘制顺序已经被父级锁死。

**七个层级（同一上下文内从下到上）**
1. 背景与边框；
2. 负 z-index 的定位元素；
3. 块级普通流盒子；
4. 浮动盒子；
5. 行内普通流内容；
6. z-index 为 0 或 auto 的定位元素；
7. 正 z-index 的定位元素。

**排查思路**
1. 在元素面板逐级向上看祖先，找出第一个"形成层叠上下文且 z-index 较低或本身在更早绘制层"的节点。
2. 确认弹层是渲染在组件树内部还是用传送门挂到 body 上。挂在 body 下可以跳出祖先上下文，这是最常用的解法。
3. 检查祖先是否有 transform、opacity、filter 这类"意外"触发条件，动画库经常无意中加了 transform。
4. 确认没有用 z-index 竞争去堆数字，数字只会让问题更难查。

**fixed 的陷阱**
position: fixed 的包含块是视口，但祖先只要有 transform、filter、perspective、will-change 中的任意一个，包含块就变成该祖先，fixed 退化成类似 absolute 的效果，滚动时跟着走、定位基准也不对。这不是 bug，是规范里包含块的规则。解决办法是把弹层挂到 body，或避免在有 fixed 需求的链路上使用 transform。

**工程建议**
统一管理层级：用 CSS 变量定义几档（内容、浮层、弹窗、通知），禁止随手写 9999；弹层一律走传送门；组件库内部用 isolation: isolate 隔离自己的层叠环境，避免外部污染。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('fb3a6af4643b15caa94e7884','一维排列该用 flex 还是 grid，两者的计算模型差在哪','要求说明 flex 与 grid 的适用边界，并解释 flex: 1 到底展开成什么、为什么有时候设了 flex: 1 内容还是溢出。接着追问：grid 的 fr 与 auto 怎么配合，卡片网格的自适应列数如何实现，什么场景必须用 grid。','**一句话区分**
flex 是一维的、内容驱动的：先有内容，再按内容尺寸分配主轴空间。grid 是二维的、布局驱动的：先定义行列轨道，再把内容放进格子。选型看你要"按内容排"还是"按格子排"。

**flex: 1 展开**
等价于 flex-grow: 1、flex-shrink: 1、flex-basis: 0%。basis 为 0 意味着基础尺寸不看内容宽度，剩余空间全按 grow 分配，所以多个 flex: 1 的项会等宽。常见的溢出来自两个原因：
1. 项目的最小尺寸是 auto，内容（长英文、不换行的文本、图片）撑开了它，需要 min-width: 0 或 overflow: hidden 才能压下去。
2. 写成了 flex: 1 1 auto，basis 取内容宽度，分配结果不等宽。

**flex 的计算顺序**
先按 basis 定基准，再按剩余空间（容器尺寸减基准总和）分 grow，空间不足时按 shrink 加权收缩（权重是 shrink × basis）。这个模型适合工具栏、导航、按钮组、垂直居中这类一维排列。

**grid 的关键能力**
1. 显式定义行列：grid-template-columns 与 grid-template-rows，可以命名区域。
2. fr 单位表示剩余空间的份数，配合 minmax 可以做出"最小宽度 + 自适应"：grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))，容器变宽自动增加列数，这是卡片网格的标准写法。auto-fit 与 auto-fill 的区别在于空轨道是否折叠。
3. 二维对齐：justify-items/align-items 与 place-items 一次控制两个方向。
4. 区域布局：grid-template-areas 用文本画出页面骨架，改版时只改这段字符串，比改一堆定位清晰得多。

**必须用 grid 的场景**
需要行和列同时对齐的表单、仪表盘、后台页面骨架、卡片网格、圣杯布局。需要内容自适应宽度的一维排列，flex 更简单。

**混用的实际形态**
页面骨架用 grid 划出头部、侧边、内容区；内容区内部用 flex 排列工具栏和列表；卡片内部再用 flex 做纵向布局。不必二选一。

**注意**
grid 的隐式轨道（grid-auto-rows）默认是 auto，做等高卡片时要显式设 1fr 或固定值；flex 的 gap 现在兼容性已经很好，别再用 margin 负值那套技巧了。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('2e7a12edf621f1cb29067edd','移动端 1px 边框为什么变粗，viewport 适配方案该怎么选','设计稿是 750 宽、设备像素比 2 和 3 的机型上 1px 边框看起来比设计稿粗一倍以上。要求给出三套 1px 方案并比较兼容性，然后说明 rem、vw、以及现代方案各自的取舍。追问：为什么现在新项目不再推荐 lib-flexible 那一套。','**为什么会粗**
CSS 的 1px 是逻辑像素，在 dpr 为 2 的设备上占 2 个物理像素。设计稿标注的 1px 通常是物理像素，所以看起来粗了一倍。这不是 bug，是两套像素体系的差异。

**1px 方案**
1. transform 缩放：用伪元素画 1px 边框，再 scaleY(0.5) 或 scale(0.5) 并设 transform-origin，配合媒体查询按 dpr 分别缩到 0.5、0.333。兼容性好，是主流方案；缺点是要处理圆角（缩放后 radius 也要相应放大）。
2. 0.5px 边框：直接写 border: 0.5px，iOS 支持良好，部分安卓机型会渲染成 0 或不渲染，兼容性不稳。
3. box-shadow 模拟：0 0 0 0.5px 颜色，能用但圆角和性能都一般，边缘发虚。
4. 渐变背景或 border-image：用线性渐变画 1px 线，可控但代码难读，适合分隔线不适合卡片边框。
5. 整体缩放：viewport 里设置 initial-scale=1/dpr 让 1 CSS 像素对应 1 物理像素，再用 rem 换算。彻底但有副作用：影响所有尺寸计算、第三方组件、以及 1px 之外的所有视觉细节。

**适配方案演进**
- rem + 动态根字号（lib-flexible 那一套）：运行时改 html 的 font-size，配合 postcss 把 px 转 rem。问题是根字号变化会引起整页重排、与第三方库冲突、在 iPad 和折叠屏上换算混乱，官方也早已不推荐新项目使用。
- vw：1vw 等于视口宽度的 1%，用 postcss-px-to-viewport 按设计稿宽度换算，纯 CSS 计算，不依赖运行时 JS，是目前的主流。注意要排除 1px 边框和不需要缩放的第三方组件，横屏和大屏要设上限（配合 max-width 或媒体查询）。
- clamp 与容器查询：现代方案更倾向于用 clamp 做字号流式缩放、用容器查询做组件级响应式，而不是整页等比缩放。容器查询让组件根据自身宽度调整，比全局视口换算更符合组件化。

**结论**
1px 用伪元素 + transform 最稳；布局单位优先 vw 或直接写 px 配合弹性布局，只在确实需要等比的场景用缩放；整页 scale 的方案除非历史包袱，不要新引入。核心判断标准是"缩放是否只影响我这一层"，越局部的方案越好维护。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('120e4cc974df83a8b44c62e8','十万行表格用虚拟列表怎么实现，行高不固定时位置怎么算','后台需要渲染十万行、每行内容可能换行导致高度不一的表格，要求给出虚拟滚动方案：可见区计算、缓冲区、不定高的测量与定位、滚动条高度维护。追问：快速拖动滚动条时出现空白怎么处理，为什么不能简单用 index 乘以固定行高。','**基本模型**
只渲染视口内加缓冲区的那部分行。三个量决定一切：滚动容器高度 H、滚动距离 scrollTop、每行的位置与高度。渲染范围用二分查找在位置数组里定位起始行，结束行由起始行累加高度到超过 scrollTop + H + buffer 为止。

**定高的做法**
行高固定时，第 i 行的 top 就是 i × rowHeight，总高度是 n × rowHeight，起始索引是 floor(scrollTop / rowHeight)。O(1)，最简单，也是大多数表格库的默认路径。

**不定高的做法**
1. 维护 offsets 数组，第 i 项是前 i 行高度之和（前缀和），另存每行的实测高度，未测量过的用预估值（比如 40）。
2. 总高度取 offsets[n]，撑开滚动条。行容器用 transform: translateY(offset) 定位，而不是 top，避免触发布局。
3. 渲染后用 ResizeObserver 拿到真实高度，与预估值比较，若不同则从该行往后重算前缀和（可以只重算受影响区间，或标记脏区间惰性修正），并修正滚动位置，否则会出现内容跳动。
4. 二分查找：offsets 单调递增，查找第一个 offsets[i] > scrollTop 的 i，复杂度 O(log n)。十万行也只查十几次。

**快速拖动出现空白**
两个原因：一是渲染范围按预估高度算错了，二是渲染跟不上滚动。处理手段：
1. 给滚动加 requestAnimationFrame 节流，一帧只算一次范围，避免每个 scroll 事件都重算。
2. 缓冲区按屏高的一半到一屏设置，快速滑动时先渲染占位骨架，等滚动停稳再补真实内容。
3. 极端场景可以用滚动锚定：拖动过程中显示"正在加载"的占位块，停稳后渲染，体验比白屏好。
4. 需要注意浏览器的滚动锚定（scroll anchoring）可能在我们改高度时自动修正 scrollTop，冲突时给容器加 overflow-anchor: none。

**还能更省的地方**
单元格内容用 content-visibility: auto 让屏幕外的复杂内容跳过渲染；行内不要放大量事件监听，用事件委托；列宽固定、避免每行重新测量文字；数据层分页或按需展开，十万行同时进内存本身也是负担。

**易错**
把虚拟列表写在 v-for 或 map 里生成所有行再用 CSS 隐藏，那等于没做虚拟化；用 index 当 key 在插入删除时会导致复用错乱；忘记同步容器的总高度，滚动条长度不对，用户拖不到底部。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('0e4bde309660c219b1548986','首屏优化该按什么顺序做，效果怎么量化到具体数字','一个首屏 4 秒的管理后台要优化到 2 秒以内，要求给出排查顺序、优化清单和验收口径。追问：LCP 和 FCP 分别反映什么，怎么区分是网络问题还是渲染问题，优化收益怎么跟产品讲清楚。','**先量化再动手**
用真实用户监控拿 P75 分位的指标，而不是本地 Lighthouse 跑一次就下结论。核心指标：TTFB（服务端与网络）、FCP（首次内容绘制）、LCP（最大内容绘制，最能代表"看到了"）、INP（交互响应）、CLS（布局偏移）。再配合资源瀑布图看关键路径上谁在等谁。

**排查顺序（按收益从大到小）**
1. 传输层：TTFB 高就先解决服务端渲染、接口串行、DNS 与 TLS 握手、CDN 命中率。这一层往往是最大头。
2. 关键资源：首屏必需的 JS/CSS 是否被阻塞解析、是否有同步脚本、字体是否阻塞文字渲染、是否加载了首屏用不到的库。
3. 资源体积：路由级代码分割、按需引入组件库、移除重复依赖、图片换 AVIF/WebP 并按尺寸出图、开启压缩。
4. 渲染路径：骨架屏减少白屏感知、关键 CSS 内联、避免首屏大图无尺寸导致 CLS、字体用 font-display: swap。
5. 缓存：HTML 不缓存、静态资源长缓存加 hash、接口做合理的缓存或预取。

**具体动作清单**
preconnect 关键第三方域；preload 首屏字体与首屏大图（注意 crossorigin）；路由懒加载配合 Suspense 或骨架；把埋点、监控 SDK 延后到首屏之后；列表首屏只取 20 条，不要一次拉全量；图片懒加载加 decoding="async"；用 performance.mark 打点定位自研模块耗时。

**怎么量化**
1. 定基线：上线前采集一周的 P75，记录样本量。
2. 灰度对比：按用户 ID 或地域分流，比较实验组与对照组的 P75 与转化指标，而不是只看单机跑分。
3. 归因：用资源瀑布图算出每个动作省了多少毫秒，加总与实测差异控制在合理范围，别把并行优化都算成线性叠加。
4. 讲给产品听：不说"减少了 300KB"，说"首屏可交互时间从 4.1s 降到 1.9s，跳出率下降 X，订单转化提升 Y"。技术指标要翻译成业务指标，并且给出置信度与样本量。

**验收口径**
把预算写进 CI：首屏 JS 体积、LCP 阈值、请求数上限，超了就让流水线失败。没有预算的性能优化会在两个迭代后回退。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('45b172306b91392a78374f7b','长列表滚动掉帧怎么定位，哪些写法会让每帧都触发布局','一个两万行的列表滚动时帧率只有 20 出头，要求给出定位思路和优化手段。追问：scroll 事件里读 offsetTop 为什么会卡，transform 与 top 做位移的差别，content-visibility 能不能直接解决问题。','**先分清瓶颈类型**
1. 主线程被占满：滚动事件回调里做了重计算，或者每帧都在改大量样式。
2. 布局与绘制过重：DOM 节点太多、每帧都在触发布局或重绘。
3. 合成开销：图层太多或超大图层，GPU 带宽吃紧。

用性能面板录一段滚动，看 Frames 是否大面积标红、Main 上是否有超过 50ms 的长任务、有没有 "Forced reflow" 警告，基本能定位到上面哪一类。

**scroll 回调里的坑**
scroll 事件触发频率高于帧率，回调里读 offsetTop、scrollTop、getBoundingClientRect 会强制同步布局（读写交替），再加上每次读都触发一次布局，滚一下就卡死。正确做法：
1. 监听器加 passive: true，告诉浏览器不会 preventDefault，滚动可以不等 JS。
2. 回调里只记录 scrollTop，真正的计算放到 requestAnimationFrame 里，一帧一次。
3. 读写分离：先批量读，再批量写。

**位移用 transform**
改 top 或 margin 触发布局，改 transform 只走合成。列表项用 translate3d 或 translateY 定位，配合 will-change: transform（慎用，图层多了内存吃不消）。批量改样式时用 DocumentFragment 或一次性切换 class，别逐条改。

**DOM 数量才是根本**
两万行全量渲染，无论怎么优化样式都救不回来。要么虚拟滚动，只渲染可视区；要么分页、分组折叠。content-visibility: auto 能让屏幕外元素跳过渲染，对中等长度列表（几千行）有明显效果，但它不减少 DOM 数量和内存占用，超过一万行仍然要虚拟化。注意它需要配合 contain-intrinsic-size 声明占位尺寸，否则滚动条会跳。

**其他细节**
行内有图片时给固定尺寸或用 aspect-ratio，避免滚动中触发布局；避免用 box-shadow 大面积阴影（绘制成本高）；用 CSS 的 overscroll-behavior 控制滚动链；移动端避免在滚动容器上用 position: sticky 加复杂效果。

**验证方式**
优化后用 performance 面板对比同一段滚动的帧耗时分布，再在低端机上实测。桌面跑 60 帧不代表中端安卓没问题，DevTools 的 CPU 降速可以模拟，但最终要以真机为准。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('523dc7b322670fa16f9f203a','图片懒加载怎么做才不抖，decoding 和 fetchpriority 分别解决什么','长页面有几百张商品图，要求在保证 LCP 的前提下做懒加载，并说明占位、解码、尺寸适配的配合方式。追问：loading="lazy" 和 IntersectionObserver 该选哪个，首屏大图为什么不能懒加载，CLS 是怎么被图片撑出来的。','**懒加载的两条路**
1. 原生 loading="lazy"：零代码，浏览器自己判断距离与网络状况，兼容性已经很好。缺点是无法自定义触发距离、无法在加载前做模糊占位，某些浏览器对首屏图也会延迟加载，反而拖慢 LCP。
2. IntersectionObserver：可控性强，可以设 rootMargin 提前加载（比如提前 200px），配合占位图、骨架、加载失败重试都能做。需要自己处理首屏图的立即加载，以及 IO 不支持时的兜底。

**首屏图不能懒加载**
LCP 元素如果被 lazy 推迟，LCP 直接变差。首屏大图应该用 fetchpriority="high" 提升优先级，配合 preload 或直接内联到首屏 HTML，明确告诉浏览器这是关键资源。剩下的图才懒加载。

**防抖动的关键**
图片没加载完时高度为 0，加载完撑开，导致 CLS。三个办法：
1. 给 img 显式写 width 和 height 属性，浏览器据此算出宽高比并预留空间，这是最简单有效的手段。
2. 用 aspect-ratio 或 padding-top 百分比占位，适合响应式图片。
3. 用带主色的模糊占位（LQIP）或骨架块，视觉上也没有跳动感。

**decoding 的作用**
decoding="async" 让图片解码不阻塞主线程，适合大量图片同时进入视口的场景；decoding="sync" 会阻塞渲染以保证同帧可见，只在必须立刻显示的图（比如弹窗主图）上考虑。它和加载是两件事：async 不改变什么时候下载，只改变什么时候解码。

**尺寸与格式**
用 srcset 与 sizes 让浏览器按视口选合适的图，避免把 2000px 的图塞进 200px 的格子；格式优先 AVIF，其次 WebP，用 picture 做降级；小图考虑内联为 data URI 或雪碧图省请求，但要权衡缓存收益。

**实现细节**
1. 用 data-src 存真实地址，进入视口后替换 src，加载完成后 unobserve，避免重复触发。
2. 监听 error 做一次重试，仍失败就显示占位，不要让破图图标暴露。
3. 懒加载容器要避免同时触发几十张图，可以加并发上限，或按滚动方向优先加载下方的图。
4. 骨架屏与懒加载要联动：占位块的高度必须和最终图片一致。

**验证**
用性能面板看 LCP 元素是否被推迟、CLS 是否有图片相关的位移、Network 里是否有远超展示尺寸的大图。这三项查完基本就能确认懒加载没有帮倒忙。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('7efc8b140fed1f7f55470593','内存泄漏该怎么查，哪些代码模式最容易把 DOM 和闭包留住','单页应用切换路由十几次后内存从 80MB 涨到 600MB，要求给出排查流程和判定标准。追问：怎么确认是泄漏而不是缓存，为什么定时器和事件监听最容易出问题，WeakMap 在这里能起什么作用。','**先区分泄漏与缓存**
正常缓存会稳定在一个上限，泄漏则是单调上升不回落。判定方法：反复执行同一个操作（比如进出同一个页面十次），每次强制 GC 后记录堆大小，看是否呈线性增长。DevTools 的 Memory 面板可以手动触发 GC。

**排查流程**
1. Performance monitor 看 JS heap size 与 DOM 节点数，确认增长趋势。
2. 堆快照三次对比：操作前拍一张、操作后拍一张、再操作一次后拍第三张，用 Comparison 视图看哪些构造函数在持续增加。Delta 为正且数量与操作次数成正比的就是嫌疑对象。
3. 看 Detached 节点：Detached HTMLElement 数量持续增长，说明 DOM 已从文档移除但仍被 JS 引用，通常是事件监听、闭包、全局数组导致的。
4. Allocation instrumentation on timeline 可以看到分配时间点，定位是哪段代码分配的。
5. 在快照里搜索构造函数名，点开 Retainers 链条，找到持有它的那个引用，一路往上就能定位到具体代码。

**最常见的几种模式**
1. 事件监听：给 window 或 document 加监听，组件卸载时没移除，回调闭包持有整个组件状态。用 AbortController 的 signal 统一移除是现代写法。
2. 定时器与轮询：setInterval 没清，回调里的闭包一直活着。
3. 全局缓存：Map 或数组存了组件实例、DOM 节点、请求结果，只增不删。
4. 订阅：WebSocket、EventSource、store 订阅、IntersectionObserver、ResizeObserver 没有 disconnect。
5. 闭包持有大对象：回调里引用了整个列表数据或大 Buffer，即使只用到一个字段。
6. 游离 DOM：从文档移除节点但 JS 变量还引用着，节点及其子树都无法回收。

**WeakMap 的定位作用**
以 DOM 节点或组件实例为键存附加数据，节点被回收时条目自动消失，不会因为这张表把节点留住。反过来，如果用了 Map，就必须在卸载时手动 delete，漏一处就是泄漏。所以"以对象为键的映射"优先用 WeakMap，这是从源头减少泄漏的设计。

**修复后的验证**
改完再跑一遍十次进出，堆大小回落到基线附近、Detached 节点数不再增长才算解决。只把某处 delete 加上就说修好了，通常还会漏。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('e101138c7cc8caee6cf007d0','Performance 面板上该看什么，怎么从火焰图定位到具体代码','要求说明录制一段交互后如何读火焰图、Bottom-Up、Call Tree 三个视图，并解释长任务、forced reflow、LCP 标记分别怎么用。追问：为什么有的函数在火焰图上很宽但自身耗时很小，怎么区分主线程阻塞与网络等待。','**录制前先明确目标**
面板不是随便录一段就能看出问题。先确定要回答的问题：首屏慢、交互卡、还是滚动掉帧。录制时勾选 Screenshots 与 Web Vitals，加上 CPU 降速（4x 或 6x）放大问题，时长控制在几秒内，避免噪声。

**火焰图的读法**
横轴是时间，纵轴是调用栈深度，色块越宽表示占用时间越长。重点看三处：
1. Main 轨道上超过 50ms 的任务（右上角红色三角标出长任务），这是交互卡顿的直接来源。
2. 有没有 Forced reflow 警告，出现即说明代码里读写交替触发了同步布局。
3. 有没有长时间的 Function call 或 Recalculate Style、Layout 块，判断是脚本慢还是渲染慢。

**三个视图的分工**
- Call Tree：按调用栈聚合，适合看"谁调用了谁"，从根往下找耗时分支。
- Bottom-Up：按自身耗时（Self Time）排序，回答"到底哪个函数最费 CPU"。火焰图上很宽但自身耗时小的函数，通常是在等子调用或等异步，自身并不慢，这类要用 Bottom-Up 才能排除。
- Event Log：按时间顺序列出事件，适合看事件触发频率与顺序。

**关键标记**
LCP 标记会指出最大内容绘制的元素和时刻，配合它的加载链路看是被什么阻塞；CLS 标记能定位是哪次布局偏移；Network 轨道看请求排队与等待时间，判断是带宽受限还是服务端慢。主线程阻塞与网络等待的区别很明显：网络等待时 Main 轨道是空的，请求在 Network 轨道上挂着。

**定位到具体代码的路径**
火焰图里找到耗时块 → 看它对应的事件（click、scroll 还是 timer）→ 展开调用栈找到自己代码的文件与行号 → 用 Bottom-Up 确认这个函数是自身慢还是下属慢 → 在源码里加 performance.mark/measure 做更细的分段。

**常见结论的对应关系**
- 大量 Layout 块伴随 Forced reflow：读写分离，批量改样式。
- 长任务集中在某个计算函数：拆分任务、用 Web Worker、加节流。
- Recalculate Style 很宽：选择器复杂度或 class 频繁切换，减少样式重算范围。
- GC 频繁出现：短生命周期对象分配过多，检查循环里创建大对象。

**别只看单次录制**
优化前后用同一段操作、同样的降速倍数对比，并且以真实用户监控的 P75 为准。面板能告诉你"哪里慢"，不能告诉你"用户有多慢"。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('c18166a832cd815d29b1ff94','Webpack 项目迁到 Vite 会遇到哪些坑，构建产物为什么不能直接对比','一个跑了四年的 Webpack 4 项目要迁到 Vite，要求列出迁移中会踩的坑和对应改法。追问：开发环境正常但生产构建报错是什么原因，CommonJS 依赖怎么处理，旧浏览器兼容怎么做。','**根本差异**
开发环境 Vite 用原生 ESM 按需编译，浏览器直接请求模块；生产构建用 Rollup 打包。Webpack 先打成 bundle 再服务。两套机制对代码的假设不同，坑都来自这里。

**坑一：CommonJS 依赖**
开发时 Vite 用 esbuild 预构建把 CJS 转成 ESM，但只处理 node_modules。源码里的 require、module.exports 在 ESM 下不成立，必须改成 import/export；运行时才知道路径的 require 改成 import.meta.glob。

**坑二：Node 全局变量**
__dirname、process.env 在浏览器不存在。路径改用 new URL(''./x'', import.meta.url)；环境变量用 import.meta.env，只暴露 VITE_ 前缀，且必须静态访问，解构或动态取值拿不到值。

**坑三：开发与生产行为不一致**
开发用 esbuild，生产用 Rollup 加插件链。只在构建期生效的转换（babel 插件、装饰器、按环境替换的常量）会让 dev 正常、build 报错，先跑一次 build 把差异收到插件配置上排查。

**坑四：资源与静态文件**
import 图片得到的是 URL 字符串；public 目录不参与哈希，要用绝对路径；雪碧图插件方案要替换；worker 用 new Worker(new URL(...), { type: ''module'' }) 的写法。

**坑五：环境与代理**
代理从 devServer.proxy 搬到 server.proxy；HTML 注入用 transformIndexHtml；全局变量用 define 注入（值要 JSON 序列化）。

**坑六：旧浏览器**
Vite 默认面向支持 ESM 的现代浏览器，兼容旧环境要 legacy 插件，会多产出一份 SystemJS 包，"包更小"的对比也就不成立。

**产物对比的正确方式**
1. 比同一入口首屏 JS 的 gzip 体积，而非 chunk 总数。
2. 对齐 chunk 划分：Rollup 按动态 import 切分，Webpack 的 cacheGroups 要手动搬到 manualChunks。
3. Vite 默认不做 polyfill 和 legacy 转换，产物小可能只是少做了兼容。
4. 用真实页面的 LCP、TBT 对比，别只看构建日志。

**要不要换 Rspack**
Rspack 与 Webpack 配置高度兼容，通常是换包、换少数插件、把 babel-loader 换成内置 swc loader，改动面比迁 Vite 小，适合大型老项目渐进迁移。Vite 更适合新项目，收益在开发体验。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('3136bec29d762f957ff0c654','CommonJS 为什么摇不掉，ESM 要做哪些事才能真正 Tree-Shaking','打包后引入了一个工具库但只用了其中一个函数，体积却几乎没变。要求解释 CJS 与 ESM 在静态分析上的差别，并给出让 Tree-Shaking 生效的完整条件。追问：sideEffects 字段写错会怎样，barrel 文件为什么会拖累构建。','**CJS 为什么摇不掉**
require 是运行时函数，参数可以是任意表达式，导出对象可以在运行中被改写、被动态赋值、被遍历。打包器无法在编译期确定"哪些导出被用到了"，只能保守地整包保留。循环依赖、给 exports 重新赋值、条件 require 都会让分析进一步退化。

**ESM 的前提**
import/export 是静态声明，必须在顶层、路径必须是字面量，声明会被提升，绑定是只读的活引用。这让打包器能在不执行代码的情况下构建完整的依赖图，判断每个导出是否被引用，未引用的可以安全删除。

**Tree-Shaking 生效的五个条件**
1. 使用 ESM 源码或 ESM 构建产物，优先看包的 exports 或 module 字段，而不是 main。
2. 包声明 sideEffects: false，或者在 sideEffects 数组里精确列出有副作用的文件（CSS、polyfill）。没有这个声明，打包器不敢删——它怕删掉的是"引入即执行"的副作用代码。
3. 引入方式可静态分析：具名导入 import { a } from ''x''。默认导入整个命名空间再取属性、动态字符串拼接路径都会退化成保留全部。
4. 代码本身没有顶层副作用：顶层执行 DOM 操作、注册全局、修改原型、立即调用函数，都会被视为必须保留。
5. 经过压缩器二次清理：webpack 的 usedExports 只标记，真正删除靠 Terser/SWC 的 dead code elimination。纯函数调用需要 /*#__PURE__*/ 注释辅助判断。

**sideEffects 写错的后果**
漏写（默认 true）会让该删的模块被保留；错写成 false 但实际有副作用，可能把 polyfill、样式引入、全局注册删掉，运行时报错。库作者要精确声明，业务方别随手改。

**barrel 文件的问题**
index.js 里集中 re-export 几十个模块，本身无害，但会让打包器把每个被 re-export 的模块都拉进依赖图，构建变慢；如果这些模块有副作用或不能被摇掉，产物也会变大。优化手段：直接按路径引用具体文件、库作者提供子路径导出（exports 里声明 ./xxx）、避免在 barrel 里做有副作用的初始化。

**常见误区**
- 开了 minify 不等于摇树：压缩只做死代码消除，前提是模块已被标记可删。
- 它按导出粒度工作，删不掉对象内部的字段，所以工具库应导出独立函数而不是大对象。
- 生产环境才生效：开发模式通常保留未使用导出以便调试，别在 dev 里判断体积。

**验证方法**
用打包分析插件看某个模块是否真的消失；改一行导入后再看产物体积差；对关键依赖单独做一次最小复现工程，比在主工程里猜更快。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('9a4e0806307c57810da37738','pnpm 的软链接结构怎么消除幽灵依赖，什么情况下又必须打补丁','团队从 npm 换到 pnpm 后，原本能跑的项目报 "Cannot find module"，另一些工具又提示找不到插件。要求解释 pnpm 的目录结构与解析规则，并说明这两类问题的成因与解法。追问：硬链接和软链接分别用在哪，CI 里怎么复用存储。','**目录结构**
pnpm 把所有包按内容寻址存在全局存储里（同一份文件只存一次），项目 node_modules 下有两个关键部分：
1. node_modules/.pnpm/ 里是真实的包目录，每个版本一个文件夹，包与包之间的依赖用软链接指向同级 .pnpm 里的其他包。
2. 顶层 node_modules 只放项目直接声明的依赖，且都是软链接，指向 .pnpm 里的真实目录。

**两级链接的分工**
全局存储到 .pnpm 用硬链接：同一文件在磁盘上只有一份，多个项目共享，省空间也快。.pnpm 内部与顶层 node_modules 之间用软链接：建立依赖图的指向关系，删除和切换版本只改链接。

**幽灵依赖为什么消失**
Node 的模块解析会逐级向上找 node_modules。npm 把依赖扁平化提升到顶层，导致没声明的包也能 require 到，这就是幽灵依赖——本地能跑，换台机器或换包管理器就崩。pnpm 的顶层只有直接依赖，未声明的包解析不到，构建时就暴露问题。这不是 pnpm 的 bug，是把隐藏的依赖错误提前暴露。

**两类报错的解法**
1. 自己的代码用了没声明的包：把它加到 package.json 的 dependencies，这是正确做法，别用提升绕过。
2. 工具生态需要提升：某些 ESLint 插件、Babel 插件、构建工具会去顶层找同级包，它们依赖扁平结构。用 .npmrc 的 public-hoist-pattern 精确提升（比如只提升 eslint 相关），或用 shamefully-hoist 全量提升（等于退回 npm 的扁平结构，幽灵依赖会回来）。
3. peer 依赖不满足：pnpm 对 peer 校验更严格，警告要当真处理，用 peerDependenciesMeta 声明可选，或在根上显式安装。
4. 完全兼容老项目：node-linker=hoisted 切换成扁平布局，作为过渡手段。

**CI 与存储**
在 CI 里缓存 pnpm store 目录，配合 pnpm install --frozen-lockfile 保证锁文件不被改写。注意硬链接跨文件系统会失败并退化为复制，容器里挂载不同卷时构建会变慢，把 store 和项目放同一卷可以避免。

**Monorepo 里的组合**
pnpm workspace 配合 workspace 协议引用内部包，配合 catalog 统一外部依赖版本；内部包之间的依赖用 workspace:*，发布时自动替换成真实版本号。

**判断标准**
遇到找不到模块，先问"这个包在我的 dependencies 里吗"，是就去补声明，不是就查工具是否需要提升。把所有报错都用 shamefully-hoist 压下去，等于放弃了 pnpm 最大的价值。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('9b6b8002e7b59c5a68d0fc06','微前端的 JS 沙箱怎么实现，样式隔离为什么比脚本隔离更难','主应用要接入三个团队的子应用，要求设计沙箱方案：全局变量隔离、多实例共存、样式不互相污染。追问：Proxy 沙箱的逃逸场景有哪些，Shadow DOM 为什么经常用不了，qiankun 那套方案的实际限制是什么。','**为什么需要沙箱**
子应用都是独立构建的 SPA，会往 window 上挂全局变量、改原型、加事件监听、插样式。多个子应用共存时互相覆盖，切换后残留，表现为"进过一次 A 应用，B 应用的按钮就失效了"。

**快照沙箱**
激活时给 window 拍快照，切出时对比差异恢复。实现简单，但同一时刻只能跑一个子应用，也无法保留激活期间主应用对 window 的改动。

**Proxy 沙箱**
核心是把子应用的代码放到 with(fakeWindow) 里执行，fakeWindow 是一个 Proxy，读写都拦截：写落到子应用自己的记录里，读优先取自己的记录再回落到真实 window。这样多个子应用各有一份 window 视图，可以共存，切出时只要丢弃记录即可，不需要恢复现场。
逃逸场景要能说出来：with 只对标识符生效，通过全局对象别名访问（比如把 window 存到变量里）、通过 iframe 或 eval 的间接调用、通过原型链修改（改 Object.prototype 会污染所有实例）、CSS 里的 url 引用、以及被原生模块缓存的对象。

**iframe 沙箱**
把子应用整个塞进 iframe，JS 和 CSS 天然隔离，最彻底。代价是 DOM 与主应用分离，弹窗、路由、滚动、拖拽跨 frame 都要额外通信，性能与体验开销大。折中方案是用 iframe 跑 JS、把渲染内容代理到主文档（wujie 的思路），复杂度更高但隔离与体验兼顾。

**样式隔离的三种粒度**
1. Shadow DOM：真正的作用域隔离，外部样式进不来，内部样式出不去。问题是第三方组件常把弹窗挂到 document.body，直接逃出影子树；全局样式（字体、reset）需要 :host 与 CSS 变量桥接；某些库依赖 document 查询会失效。
2. 运行时加前缀：给子应用所有选择器加一个唯一前缀（类似 scoped），并在子应用卸载时移除对应 style 标签。实现要解析 CSS 文本，动态插入的样式和 @media、@keyframes 容易漏。
3. 构建期隔离：CSS Modules 或 CSS-in-JS 生成唯一类名，从源头避免冲突。需要子应用配合改造，对存量项目成本高。

**为什么样式更难**
JS 有执行入口和 window 这个收口可以拦截；CSS 是全局的、可随时通过 style 标签或 DOM API 注入，没有统一收口。样式隔离只能在构建期做唯一性、运行期做文本改写，或用 Shadow DOM（有逃逸问题）。

**方案取舍**
子应用可控：构建期加前缀与 CSS Modules，成本最低。子应用不可控：Proxy 沙箱加运行时样式改写，接受漏网。隔离要求极高：iframe。没有方案能同时满足彻底隔离与零成本，选型要写清妥协点。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('f7b3219c9d20864a47cb26c2','Monorepo 里依赖该怎么管，多包共用一个 React 为什么会报错','仓库里有二十个包，出现三个问题：某个包升级后其他包莫名报错、构建时 React 被装了两份导致 hooks 报错、CI 每次都全量构建。要求给出依赖管理与任务编排方案。追问：内部包版本怎么发，锁文件冲突怎么处理。','**结构选择**
用 workspace 定义包边界，pnpm 的 workspace 协议让内部包以 workspace:* 引用，本地直接软链接，改完立即生效，不需要先发版。这是 Monorepo 的最大价值：跨包改动一次提交完成。

**依赖一致性**
二十个包各自声明 React 版本，迟早出现多个副本。三条约束：
1. 框架类依赖用 peerDependencies 声明在组件库里，由应用层统一提供版本。
2. 用 catalog 或根级 overrides 锁定关键依赖的版本，避免各包漂移。
3. 提交前用脚本或 lint 规则检查重复依赖，发现多实例立刻修。

**React 两份导致 hooks 报错的原因**
hooks 依赖模块内部的共享状态（dispatcher），两份 React 就是两套状态。表现是 "Invalid hook call" 或渲染结果异常。常见来源：某个包把 React 写进 dependencies 而不是 peerDependencies；包管理器把不同版本分别安装；软链接配置导致解析到不同路径。排查手段是打印 React 的解析路径，或在打包配置里把 React 设为 external 并声明为单例。

**任务编排**
1. 用任务图工具（Turborepo、Nx）声明任务依赖，比如 build 依赖 ^build（先构建依赖包）。
2. 开本地缓存与远程缓存，命中缓存的任务直接跳过，CI 时间能降一个数量级。
3. 只跑受影响的包：根据 git diff 计算变更包及其下游，用 --filter 限定范围。
4. 并行度按 CPU 核数设置，注意构建工具本身的内存占用。

**版本与发布**
用 changesets 管理：改动的包写一个变更说明文件，发布时统一计算版本号、生成 changelog、按依赖关系顺序发布。固定版本模式（所有包同一版本）适合强耦合的产品线，独立版本适合对外提供的工具库。发布内部包时要把 workspace:* 替换成真实版本号，别把协议写进产物。

**锁文件冲突**
大型仓库里锁文件冲突很常见。缓解办法：把依赖升级集中到一次自动化 PR（定期跑升级脚本），减少人工改 package.json 的频率；CI 用 --frozen-lockfile 防止意外改写；冲突时不要手工合并锁文件，重新安装生成。

**边界纪律**
包之间不要通过相对路径互相 import，必须走包名，否则打包、类型、发布全乱；公共类型单独成包；避免环形依赖，用接口下沉或事件解耦。Monorepo 的成本主要不在工具，而在这些边界约定能不能被 lint 强制执行。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('338706e3e183ecc01642ddc4','一条完整的前端 CI/CD 流水线该怎么设计，回滚要多久','公司要把手工发布改成自动化流水线。要求设计从提交到上线的流水线，说明各阶段做什么、缓存怎么配、质量门禁设在哪。追问：灰度发布与回滚怎么做，为什么说回滚速度比发布速度更能反映工程成熟度。','**阶段划分**
1. 触发：push 或 PR 触发，PR 跑校验类任务，主干合并才允许发布。
2. 安装：缓存包管理器的存储目录和构建缓存，用锁文件严格安装，保证可复现。
3. 静态检查：ESLint、类型检查、格式检查，并行执行，失败即中断。
4. 单测：跑覆盖率并上传报告，设阈值门禁（比如新增代码覆盖率不低于 70%）。
5. 构建：产出带版本号的制品，构建过程注入环境变量，产物上传为不可变制品。
6. 端到端测试：对预发环境跑核心链路，失败阻断发布。
7. 部署：先发预发，人工或自动验收后推进生产，按灰度比例逐步放量。
8. 观测：发布后一段时间内盯错误率、性能指标、核心业务指标，异常自动回滚。

**缓存的三层**
依赖安装缓存、构建产物缓存（任务级）、镜像层缓存。缓存键要包含锁文件哈希和源码哈希，否则会命中过期缓存。缓存命中率是流水线优化的第一指标。

**质量门禁**
不要只把门禁设在最后。静态检查和单测在 PR 阶段就拦，构建体积超预算在构建阶段拦（首屏 JS 超过阈值直接失败），端到端失败在预发阶段拦。门禁要能给出可操作的错误信息，否则会被绕过。

**灰度与回滚**
1. 制品不可变，发布只是切换指向，回滚就是切回上一版本，几秒到几十秒。
2. 灰度按用户维度分流，不要按机器分流导致同一用户来回切。
3. 前端资源要保留历史版本一段时间，否则切回旧 HTML 时引用的旧 JS 已被清掉，回滚反而白屏。
4. 回滚要有一键入口，并且演练过。没演练过的回滚流程等于没有。

**为什么回滚比发布重要**
发布是可控的、可等待的，故障是突发的。能在五分钟内止血，比一周发十次更能说明工程能力。所以流水线设计的第一优先级是"出错能退回去"，其次是"发得快"。

**常见做法**
主干开发加短生命周期分支；每次合并都可发布；环境配置与代码分离，同一制品多环境部署；密钥放在平台的密钥管理里，不写进仓库；发布记录关联需求单号，便于追溯。

**别忽略的部分**
流水线本身的维护成本：任务超过十五分钟的流水线会被开发者绕过；文档化每个阶段的作用；定期清理失效缓存；把频繁失败的任务修好，而不是让人习惯性重跑。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('9c1f27b52f64ccb3ca8bbbb9','前端监控 SDK 要采集哪些数据，怎么保证它自己不拖慢业务','要求设计一个埋点与监控 SDK：错误捕获、性能指标、用户行为、上报策略。追问：资源加载错误为什么 window.onerror 抓不到，上报为什么推荐 sendBeacon，SDK 自身的异常怎么处理。','**错误采集**
1. 运行时错误：window.onerror 或监听 error 事件，能拿到消息、文件、行列与堆栈。跨域脚本的错误会被抹成 Script error，要给 script 标签加 crossorigin 并配 CORS 头才能还原。
2. 资源加载错误：img、script、link 失败不冒泡，必须用捕获阶段监听（第三个参数 true），从 event.target 取地址。这就是 window.onerror 抓不到资源错误的原因，它只管脚本运行时错误。
3. Promise 未捕获：unhandledrejection，注意序列化非 Error 对象。
4. 框架层：React 的 error boundary 与全局 errorHandler、Vue 的 app.config.errorHandler，能拿到组件栈。
5. 请求错误：包装 fetch 与 XHR，记录状态码、耗时、失败原因。

**性能采集**
用 PerformanceObserver 订阅 paint、largest-contentful-paint、layout-shift、event、longtask、resource。能算出慢资源排名与长任务，指标要按页面和版本聚合。

**行为与上下文**
路由变化、点击、关键接口调用、控制台错误作为面包屑附在错误上报里，能大幅提升复现效率；再采集设备、浏览器、网络类型、停留时长。

**上报策略**
1. 批量加队列：攒够条数或按固定间隔发，减少请求数。
2. 页面卸载时用 navigator.sendBeacon，它不阻塞卸载，普通 fetch 可能在页面销毁时被取消，但单次有大小限制，大数据要分片。
3. 失败重试加本地缓存：写进 IndexedDB，下次启动补发，注意设上限避免占满空间。
4. 采样：错误按用户或页面采样，性能数据按比例采样，采样率要能远程配置。
5. 限流与去重：相同堆栈指纹合并计数，单页面上报条数设上限，防止错误风暴打爆服务端。

**不拖慢业务的做法**
1. 体积控制：核心捕获内联在主文档（几百字节），重型采集异步加载，首屏后再初始化性能与行为采集。
2. 堆栈原样上报，服务端用 sourcemap 还原，别在浏览器里解析。
3. 存储写入排队，空闲时批量落盘，避免同步读写。
4. 隔离故障：SDK 全部代码 try/catch，采集失败不影响业务，SDK 自身错误不再上报以免递归。
5. 包装 fetch 要保留原始行为与类型，别改时序。

**数据质量**
按指纹（消息 + 顶层堆栈 + 版本）聚合，否则同一错误刷满列表；sourcemap 传私有存储；用户标识脱敏；版本号与发布记录关联。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('9acd7bd99d5b8239f554aba4','XSS 的三种类型分别怎么触发，只在提交时过滤输入为什么不够','评论区支持富文本，要求设计防 XSS 方案。追问：存储型、反射型、DOM 型分别在哪一环出问题，为什么不能只做输入过滤，CSP 能挡住哪些、挡不住哪些，前端用 innerHTML 渲染富文本应该怎么处理。','**三种类型**
1. 存储型：恶意内容进数据库，所有访问者都会中招，危害最大，评论区、昵称、商品描述是重灾区。
2. 反射型：参数从 URL 进来、服务端直接拼进 HTML 返回，通常配合钓鱼链接使用。
3. DOM 型：服务端完全无感知，前端用 innerHTML、document.write、location 赋值等方式把不可信数据当代码执行，这类问题的根因在前端代码本身。

**为什么不能只过滤输入**
同一条数据在不同上下文里有不同危险字符：进入 HTML 文本要转义尖括号，进入属性要处理引号，进入 JS 字符串要处理反斜杠与引号，进入 URL 要处理协议。输入时不知道将来会用在哪，只能过度过滤，既破坏正常内容又防不住拼接场景。正确做法是输出时按上下文编码，输入侧只做校验和长度限制。

**富文本的正确处理**
业务确实需要保留标签时，不能只转义，要做白名单净化：只允许约定的标签与属性，剔除事件属性、javascript 协议、style 里的危险表达式，并对净化后的结果做一次二次校验。用成熟库（如 DOMPurify）而不是自己写正则。净化必须放在渲染前，且要在服务端也做一次，因为客户端可以被绕过。

**CSP 的作用与边界**
通过响应头限定脚本来源、禁止内联脚本与 eval，能大幅降低注入成功的概率，也能在出事时限制外带数据。但它挡不住 DOM 型 XSS 里的非脚本注入（比如直接插入危险属性），也挡不住已经通过白名单的第三方脚本。CSP 是纵深防御的一层，不能替代编码与净化。上线建议先用报告模式观察一段时间再切强制模式。

**其他防线**
1. 会话 cookie 加 HttpOnly，XSS 拿不到 token。
2. 富文本渲染用 iframe 沙箱并配 sandbox 属性，隔离执行环境。
3. 避免直接用 innerHTML 拼接，优先用 textContent、模板引擎的自动转义、框架的默认转义。
4. 框架里必须用危险 API 时（比如 React 的 dangerouslySetInnerHTML），在代码评审里做强制检查。
5. 服务端渲染同样要转义，别以为在 Node 里拼接字符串就安全。

**回答时的加分点**
说清"输入校验防的是数据格式，输出编码防的是执行"，两者职责不同；再说清同源策略、CSP、HttpOnly 是三道不同的闸，任何一道失效都还有下一道。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('3b0e6b36441c647763064cfb','CSRF 为什么能成功，SameSite 与 Token 各自防住了什么','转账接口只靠 cookie 鉴权，要求说明攻击链路和三种防御手段的有效边界。追问：为什么 GET 写操作尤其危险，前后端分离后 Token 方案有什么坑，登录接口需要防 CSRF 吗。','**攻击链路**
用户登录后浏览器持有会话 cookie；攻击者诱导用户访问一个恶意页面，页面里自动发起一个指向目标站的请求（表单提交、图片 src、脚本请求）。浏览器按同站规则自动携带 cookie，服务端看到合法会话就执行了操作。关键点在于：请求确实是用户浏览器发出的，只是用户不知情。

**防御一：SameSite**
设成 Lax（现代浏览器默认），跨站子资源请求和跨站 POST 都不带 cookie，直接掐断大部分链路。Strict 更严但影响从外部链接进入的体验。None 时必须配 Secure，等于放弃这层防护。局限：顶级 GET 导航仍会带 cookie，所以写操作绝不能用 GET；第三方 cookie 政策变化会让 None 变得不可靠。

**防御二：CSRF Token**
服务端下发随机 token，存在会话里，前端在请求头或表单字段里带上，服务端比对。攻击者的页面读不到 token（同源策略限制），也无法伪造。要点：
1. token 要绑定会话，一次性或有时效。
2. 放在自定义头里能顺带触发 CORS 预检，跨站请求直接被拦。
3. 前后端分离时把 token 放内存，别写进 cookie，否则又回到自动携带的老问题。
4. 多标签页、刷新后 token 失效会导致提交失败，要有续期机制。

**防御三：校验来源**
检查 Origin 或 Referer 是否在白名单内。实现简单、成本低，适合作为兜底。局限是某些场景 Referer 会被裁剪或缺失，Origin 在部分老浏览器上不可用。

**补充手段**
关键操作二次验证（短信、密码、生物识别）；接口幂等设计，重复提交不产生副作用；把状态变更限制为 POST/PUT/DELETE；CORS 白名单收紧，别用通配符加凭证。

**登录接口要不要防**
要。登录 CSRF 可以让受害者登录成攻击者的账号，之后的操作都记在攻击者账号下（比如绑定支付方式、上传内容）。这类攻击叫登录 CSRF，防御方式同样是 token 加来源校验。

**回答的落点**
先说清"CSRF 利用的是浏览器自动携带凭证这一特性"，再按"减少自动携带（SameSite）、增加攻击者拿不到的东西（Token）、校验请求来源（Origin）"三层展开，最后说明为什么要叠加而不是只选一个。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('89757719833418774ddda5cb','大文件上传怎么设计，切片、断点续传、秒传各自的关键点是什么','要支持上传几个 G 的视频，要求给出完整方案：切片策略、并发控制、断点续传、秒传、失败重试与进度。追问：文件 hash 怎么算才不卡死页面，分片顺序错乱服务端怎么合并，为什么推荐直传对象存储。','**整体流程**
选文件 → 算指纹 → 询问服务端该文件是否已存在（秒传）→ 不存在则查询已上传分片（续传）→ 切片并并发上传缺失分片 → 全部完成后请求合并 → 服务端校验并返回访问地址。

**切片**
用 File.slice 按固定大小切开，常见 2MB 到 5MB。太小请求数暴涨、合并开销大；太大单请求失败重传代价高、进度反馈粗糙。可以按文件大小动态调整：小文件单片直传，大文件切多片。

**指纹与秒传**
对文件内容算 hash 作为唯一标识。整文件全量读取在几个 G 的场景会卡死主线程，做法：
1. 放到 Web Worker 里算，避免阻塞渲染。
2. 抽样 hash：取头部、中部、尾部若干块拼起来算，速度快几个数量级，碰撞概率可接受。配合文件大小、修改时间做二次校验。
3. 服务端按指纹查库，命中直接返回已存在的地址，这就是秒传。

**断点续传**
上传前请求服务端"这个指纹已有哪些分片"，只传缺失的。本地也要记录（localStorage 或 IndexedDB），页面刷新后能恢复。分片上传成功后立即上报，不要等全部完成再记。

**并发与重试**
并发数控制在 3 到 6，太多会挤占带宽、触发服务端限流。用队列加计数器的模式，一片完成就补一片。失败重试要带指数退避，连续失败超过阈值就暂停并提示，避免无限重试打爆服务端。单个分片失败只重传该片，不要整体重来。

**合并与校验**
所有分片到齐后请求合并，服务端按序号拼接，合并后校验整体 hash（或大小）是否与客户端一致，不一致就丢弃重来。分片乱序到达是常态，服务端要靠序号而不是到达顺序合并；合并期间要防重复请求（同一指纹只允许一个合并任务）。

**进度与体验**
进度按"已完成分片字节数 / 总字节数"算，别只按分片个数。上传中允许暂停、取消，取消要通知服务端清理临时分片。弱网下要能识别"卡住"（长时间无进度）而不是"慢"。

**为什么直传对象存储**
让浏览器拿服务端签发的临时凭证直接上传到对象存储，业务服务器只负责签发凭证和接收回调。好处：不经过业务服务器，带宽与内存压力转移；对象存储原生支持分片上传、断点续传、并发；业务服务器不会因为大文件上传被打挂。代价是要处理凭证有效期、跨域配置、回调验签。

**易错点**
只在客户端记录已上传分片，换设备就失效；合并后忘记清理临时分片，存储越用越多；切片大小写死导致小文件也要走完整流程；hash 计算放在主线程，页面直接卡死；进度用分片数算，出现"卡在 99%" 的观感。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('96cbdb63ee14b42bb549a8e5','技术方案的价值怎么量化，只有"体验更好"的说法为什么过不了评审','你提出把首屏改成服务端渲染并做路由级拆包，评审会上被问"能带来什么收益、要花多少人天、怎么证明"。要求给出量化框架和汇报口径。追问：没法做 A/B 实验的场景怎么估收益，负收益的方案怎么提前识别。','**量化框架的四个维度**
1. 用户侧指标：首屏可交互时间、LCP、错误率、交互延迟、转化或留存。要给出基线与目标值，最好有分位数（P75）。
2. 业务侧指标：下单成功率、表单完成率、页面跳出率、客服工单量。技术指标必须翻译成业务语言，否则评审听不懂。
3. 成本：人力人天、机器与带宽成本、维护复杂度、对现有流程的侵入。
4. 风险：回滚难度、对存量功能的破坏面、依赖的外部条件。

**收益怎么证明**
优先做灰度或 A/B：按用户 ID 分桶，同一天对比两组的指标差异，排除大盘波动。没有实验条件时，用"归因 + 上限估计"：把总耗时拆成可测量的分段（DNS、TTFB、资源下载、解析执行、渲染），逐项估算优化能省的部分，明确写出假设与误差范围。宁可给区间，也不要给一个精确但站不住的百分比。

**汇报口径**
先说结论再给依据：把 4.1 秒降到 1.9 秒、跳出率下降 X 个百分点、需要 8 人天、可在两周内灰度验证。避免只讲技术名词，把"服务端渲染"翻译成"用户能更早看到内容"。同时给出不做会怎样：每多一秒首屏，转化损失多少，这个对比最能推动决策。

**负收益怎么提前识别**
1. 服务端渲染要新增服务端运行时、缓存层、降级方案，如果团队没有 Node 运维能力，长期成本可能超过收益。
2. 拆包会增加请求数，HTTP/1.1 环境下可能适得其反。
3. 引入重依赖换取少量性能收益，包体积和维护成本都在涨。
4. 优化只覆盖 5% 的低端设备用户，却要让 100% 的代码变复杂，投入产出不成立。

**评审材料的最小集合**
现状数据（附采集方式与样本量）、目标值、方案对比（至少两个备选）、成本估算、灰度与回滚计划、验证方式。缺任何一项，评审就容易变成立场之争。

**上线之后**
用同一套埋点复测，把实际收益写回文档。达不到预期也要记录原因，这比只报喜更能建立可信度。技术方案的可信度是靠一次次"说 2 秒、做到 2 秒"攒出来的。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('f8e73a0e706f80823ac77298','技术选型该看哪些维度，什么情况下"团队不熟"就该直接出局','要在三个状态管理方案、两个跨端框架之间做选择，要求给出可执行的评估流程和决策依据。追问：怎么避免选型被个人偏好绑架，选错之后怎么低成本纠偏，什么信号说明该换了。','**先明确约束**
选型前把不可谈判的约束列出来：交付时间、团队规模与技术栈、必须支持的端（浏览器版本、小程序、桌面端）、合规与私有化要求、预算。约束会直接砍掉大部分选项，比逐个对比功能高效得多。

**评估维度**
1. 需求匹配度：能否覆盖核心场景，而不是功能列表谁更长。
2. 团队熟悉度：学习成本、招人难度、出问题时能不能自己修。这一项权重往往被低估。
3. 生态与活跃度：issue 响应、版本节奏、周边工具链、社区规模。
4. 长期维护：是否有商业支持、是否有明确的重构计划、破坏性变更的频率。
5. 性能与体积：在目标设备上的实测数据，不是官网跑分。
6. 迁移与退出成本：能不能渐进接入，将来换掉要改多少代码。
7. 可调试性：DEV 工具、错误信息、源码可读性，直接影响日常效率。

**"团队不熟"的判定**
如果这个技术是系统的核心链路，且团队里没人能在两周内读懂它的源码级问题，那它就该出局。理由不是"学不会"，而是故障时无人兜底。例外情况：有外部支持合同、或者它是行业唯一解且业务愿意投入学习期。

**避免个人偏好**
用加权评分表，权重在讨论前定好并写进文档；让每个方案的支持者做同一份 POC，用同一组指标对比（首屏耗时、包体积、核心场景代码行数、踩坑记录）；把"我更喜欢"这类理由单独记下来，不作为决策依据。

**纠偏成本**
优先选可渐进替换的方案：把状态管理、请求层、路由封装在自己的适配层后面，业务代码不直接依赖第三方 API。这样换库时只改适配层。评估时把"适配层要写多少代码"也算进成本。

**该换掉的信号**
1. 关键 bug 长期不修，或维护者明确停止维护。
2. 每次升级都要改大量业务代码，破坏性变更频繁。
3. 性能瓶颈已经无法通过配置解决，且业务增长会持续放大。
4. 招不到人、团队里没人愿意维护，新人上手周期超过一个月。
出现两条以上，就该立项评估迁移，而不是继续打补丁。

**决策留痕**
把选型过程写成短文档：约束、候选、评分、最终结论、放弃的理由、复审时间。半年后回看，这份文档比记忆可靠得多，也能避免同一场讨论重复发生。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('8a452495d8b701e7fd90e155','线上故障排查的完整流程是什么，先止血还是先定位','晚上八点收到告警：核心下单页白屏率飙升，团队此前没做过故障复盘。要求给出从接警到复盘的完整动作序列。追问：怎么快速判断是前端问题还是后端问题，回滚与排查能不能并行，复盘该产出什么。','**第一步永远是止血**
用户正在受影响时，定位是奢侈品。先判断有没有一键手段：回滚上一版本、关闭灰度开关、降级到备用页面、切流量到健康集群。回滚的决策门槛要低，五分钟内能退回去就先退，事后再查原因。很多团队卡在"先搞清楚再说"，结果故障时长翻倍。

**并行分工**
一个人负责止血操作，一个人负责收集证据（错误堆栈、监控曲线、变更记录、用户反馈），一个人对外同步（客服、业务方、管理层）。不要所有人一起看日志。

**定位的判断顺序**
1. 看时间相关性：故障开始时间与发布、配置变更、上游接口变更是否吻合。八成问题能在这里定位。
2. 看范围：全量还是特定地区、特定机型、特定用户群。全量多半是发布或依赖故障，局部多半是兼容性或数据问题。
3. 看分层：前端错误堆栈、接口成功率与耗时、CDN 命中率、DNS。接口 5xx 上升是后端；接口正常但页面白屏是前端资源或渲染；资源 404 多半是发版缓存问题。
4. 看变更：最近一小时的发布、开关、配置、依赖升级，逐条排除。

**白屏这类问题的快速检查清单**
HTML 是否被缓存成旧版本、静态资源是否 404、是否有 JS 语法错误导致整包不执行、是否有接口返回结构变化导致渲染抛错、是否有第三方脚本阻塞、service worker 是否缓存了坏版本。这几项能在几分钟内覆盖大部分白屏原因。

**恢复之后的动作**
1. 确认指标回到基线，别只看告警消失。
2. 保留现场：日志、堆栈、监控截图、变更记录，别急着清理。
3. 通知受影响方，给出影响范围与时间窗口。

**复盘产出**
时间线（精确到分钟）、影响面（多少用户、多少订单、资损）、根因（技术根因与管理根因分开写）、处置过程中的问题（为什么十分钟才发现、为什么回滚失败过一次）、改进项（每条有负责人和截止时间）。复盘的目的不是找人背锅，否则下次没人敢在第一时间回滚。

**把流程变成能力**
告警要能定位到具体版本和页面；监控要覆盖错误率、白屏率、核心链路成功率，而不只是机器指标；每次故障后补一条监控或演练；回滚流程每季度演练一次。故障不可避免，缩短故障时长是可以工程化的。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('a33eca44569ebdf080dc5a22','用 AI 编码工具提效，具体能提在哪些环节，哪些环节不能交给它','团队要给前端引入 AI 编码工具，要求说明哪些任务适合、哪些不适合，以及怎么衡量提效是否真实。追问：生成代码的 review 成本怎么控制，代码补全和自主改仓库两种形态的差别在哪。','**适合的场景**
1. 样板与机械代码：表单字段、类型定义、接口请求封装、CRUD 页面骨架，模式固定、验收标准明确。
2. 单测与用例：给定函数签名和输入输出，让它批量生成边界用例，人再补关键断言。
3. 重构与批量替换：统一改 API、替换废弃方法、补类型标注，这类改动量大但模式单一。
4. 读陌生代码：让它解释一段逻辑、生成调用链摘要，比逐行读快。
5. 报错排查：贴堆栈和上下文，让它给出可能原因，作为假设来源而不是结论。

**不适合的场景**
1. 架构决策与方案取舍：需要业务上下文、团队约束、长期成本判断，模型看不到这些。
2. 涉及资金、权限、隐私的核心逻辑：错误代价高，且验证成本高于自己写。
3. 不熟悉的领域代码：你无法判断对错，等于把风险后移。
4. 与既有约定强耦合的改动：模型不了解你们的隐藏规则，容易写出"能跑但不合规"的代码。
5. 性能与并发这类需要实测的问题：模型给的优化建议经常停留在常识层面。

**两种形态的差别**
补全式（IDE 内联建议）人是主导，接受成本低，适合局部代码；自主式（能读写多文件、跑命令的 agent）适合有明确验收标准的任务，比如"给这个模块补测试并跑通"。后者效率更高但风险也更高，必须有测试和代码审查兜底，并且限制它能改的范围。

**怎么衡量真实提效**
1. 用同一批任务做对照：不开工具与开工具各做一遍，记录完成时间与返工次数。
2. 看返工率而不只看生成量：生成的代码被改掉多少行、review 提了多少问题，这两个指标决定净收益。
3. 看缺陷密度：AI 参与的模块线上错误率是否上升，这是最终判据。
4. 别只看主观感受，"感觉快了很多"经常是把 review 时间转移到了别人身上。

**控制 review 成本的做法**
把生成代码当外部提交对待：小步提交、每次改动可回滚、必须过 lint 与单测、核心路径强制人工逐行看；制定提示模板（项目规范、目录约定、错误处理方式）减少返工；把可复用的约束写进仓库文档，让模型读得到。

**合规与安全**
不要把内部代码、密钥、用户数据贴到未审批的外部服务；确认工具的代码是否用于训练、是否留存；生成代码的许可证来源要能追溯；第三方依赖的引入必须走内部审批。

**结论**
AI 提升的是"从想法到初稿"的速度，压缩的是重复劳动；它不替代判断力，反而放大了判断力的价值。团队真正的收益来自"用测试和规范把验收成本降下来"，而不是生成得更快。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
INSERT OR IGNORE INTO questions (id,title,content,analysis,category,author_id,is_ai,status,risk_tier,review_round,reject_reason,views,created_at,updated_at) VALUES ('bc17bfd3205dce1c27ab0130','AI 时代前端工程师的能力结构发生了什么变化，哪些能力在贬值','面试官问：AI 已经能写大部分页面代码，前端还需要掌握什么。要求结合日常工作说明能力重心的迁移，并给出自己的应对方式。追问：哪些技能仍不可替代，初级前端还有成长空间吗。','**在贬值的能力**
1. 记忆型 API 用法：背不出 Array 的方法签名已经不重要，查得到、判断得对更重要。
2. 重复性的页面搭建：表单、列表、弹窗这类模板代码，生成质量已经够用。
3. 单一框架的熟练度：会写某个框架的写法不再稀缺，理解其运行时原理仍然稀缺。
4. 手工调试的耐心：逐行 console 的能力，正在被"描述问题、给出假设、验证假设"的流程替代。

**在升值的能力**
1. 问题定义：把模糊需求拆成可验证的技术任务，这一步模型做不了，它只会顺着你的描述往下写。
2. 系统判断：选型、边界划分、状态归属、失败时怎么降级，需要权衡成本与长期维护。
3. 验证能力：能设计测试、能读懂监控、能判断一段代码"看起来对"和"真的对"的差别。审查别人（或 AI）的代码会成为核心技能。
4. 性能与稳定性：包体积、渲染路径、内存、错误率，这些需要实测和工程直觉。
5. 跨层能力：前端要理解服务端、数据、部署，才能判断一个需求该在哪一层解决。
6. 产品与业务理解：知道为什么做，比知道怎么做更稀缺。

**不可替代的部分**
线上故障时的那十分钟：判断影响面、决定回滚、组织沟通。以及所有需要承担后果的决策——技术选型、架构演进、人员与排期。模型可以给建议，但不承担责任。

**初级还有空间吗**
有，但路径变了。过去靠"写得多"积累熟练度，现在要靠"读得多、验得多"积累判断力：读优秀的开源实现、读自己项目的线上问题、把每个修复都复盘成规则。入门门槛降低了，但到达"能独立负责一个系统"的路径更陡，因为中间那层纯执行的工作被压缩了。

**落到日常的具体做法**
1. 用 AI 处理重复劳动，把省下的时间投入到读源码和排查线上问题。
2. 强制自己解释每一行生成代码的原理，解释不了就不用。
3. 建立自己的检查清单：边界、错误处理、性能影响、可观测性。
4. 保持对底层的好奇：事件循环、渲染流水线、网络协议，这些是判断力的地基。
5. 练习写清楚的技术文档，能把方案讲明白的人，在 AI 时代更值钱。

**回答的落点**
不要答成"AI 会取代前端"或者"AI 只是工具"这种口号。要说清哪部分工作被压缩、哪部分被放大，以及自己具体在做什么调整。面试官关心的是你有没有真实的应对，而不是态度。','字节高频',NULL,0,'published','low',0,NULL,0,1794916800000,1794916800000);
PRAGMA foreign_keys=ON;
