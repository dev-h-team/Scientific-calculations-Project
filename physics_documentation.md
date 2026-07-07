# المرجع الشامل لنظام الفيزياء (Custom Physics Engine)

يُعد هذا الملف المرجع الهندسي والفيزيائي للمحرك الحركي (Physics Engine) الخاص بالمشروع. تم بناء النظام بالكامل من الصفر دون الاعتماد على مكتبات خارجية (مثل Ammo.js أو Cannon.js)، لضمان التحكم الكامل في أداء ومقذوفات كرة السلة لتطابق الواقع بشكل دقيق.

---

## 1. حلقة التكامل الزمني (Fixed-Timestep Integration)
لضمان استقرار المحاكاة الفيزيائية وعدم تأثرها بتذبذب معدل الإطارات الشاشة (FPS)، يعتمد المحرك على تقنية **الخطوة الزمنية الثابتة (Fixed-Timestep - Accumulator)**، مع تطبيق خوارزمية تكامل أويلر نصف الضمني (Semi-implicit Euler).

* **القانون/المفهوم:** يتم تجميع الوقت المنقضي بين كل إطار (Delta Time) ضمن مجمع (Accumulator). عندما يتجاوز المجمع قيمة الخطوة الثابتة (مثلاً 120 هرتز)، يتم تنفيذ نبضة فيزيائية (Step)، مما يضمن حتمية المحاكاة (Determinism).
* **مكان التطبيق:** `public/js/physics/PhysicsEngine.js` داخل الدالة `update(dt)`.
* **التنفيذ البرمجي:**
```javascript
update(dt) {
  const scaled = dt * this.TIME_SCALE;
  this._accumulator += scaled;

  let steps = 0;
  // التحديث بمعدل ثابت 120 هرتز
  while (this._accumulator >= this.FIXED_DT && steps < this.MAX_SUBSTEPS) {
    this._step(this.FIXED_DT);
    this._accumulator -= this.FIXED_DT;
    steps++;
  }
}
```

---

## 2. الجاذبية الأرضية وحركة المقذوفات (Gravity & Kinematics)
محاكاة الجاذبية لا تتم عبر طرح أرقام عشوائية، بل بالاعتماد على تسارع الجاذبية الأرضية الحقيقي وتحويله ليتناسب مع مقياس عرض عالم اللعبة.

* **تحديد الثوابت:**
  - $g = 9.81 \text{ m/s}^2$
  - تم استخدام مقياس (Scale = 3.0) بحيث يعادل كل متر في الواقع 3 وحدات داخل الفضاء الثلاثي (World Units).
* **مكان التطبيق:** `PhysicsEngine.js` داخل `_integrateBody(body, dt)`.
* **التنفيذ البرمجي:** يتم تحديث السرعة بناءً على التسارع، ثم تحديث الموقع بناءً على السرعة الجيدة (Semi-implicit Euler).
```javascript
// g in world units: 9.81 m/s^2 * SCALE (3) = 29.43 wu/s^2
body.velocity.y -= this.GRAVITY * this.SCALE * dt;

// تحديث الموقع لاحقاً
body.position.x += body.velocity.x * dt;
body.position.y += body.velocity.y * dt;
body.position.z += body.velocity.z * dt;
```

---

## 3. الديناميكا الهوائية ومقاومة الهواء (Aerodynamic Quadratic Drag)
لجعل رمية كرة السلة واقعية، تفقد الكرة جزءاً من طاقتها الحركية أفقياً وعمودياً بسبب مقاومة الهواء (السحب).

* **معادلة السحب الرياضية:** 
  $$F_d = \frac{1}{2} \rho C_d A v^2$$
  *حيث $\rho$ كثافة الهواء، $C_d$ معامل السحب، $A$ المقطع العرضي للكرة، و $v$ السرعة.*
* **المعطيات الواقعية المدخلة:**
  - `AIR_DENSITY = 1.225` (كغ/م³)
  - `DRAG_COEFFICIENT = 0.47` (للكرة القياسية)
  - `BALL_MASS = 0.623` كغ.
* **التنفيذ البرمجي:** يتم حساب ثابت السحب (`_dragK`) مسبقاً، ثم في كل إطار يُحسب التباطؤ ويُنقص من سرعة الكرة لتجنب العمليات الحسابية المعقدة (Optimization).
```javascript
// حساب التباطؤ (m/s^2)
const speedMS = speedWU / this.SCALE; // تحويل السرعة لأمتار
const aDragMS = this._dragK * speedMS * speedMS; // تطبيق المعادلة: a = k * v^2

// تحويل التباطؤ مجدداً إلى وحدات العالم الخيالي
const aDragWU = aDragMS * this.SCALE;

// إنقاص السرعة بنسبة مئوية (تطبيق قوة معاكسة للاتجاه)
const reduction = Math.min(aDragWU * dt / speedWU, 0.98);
const factor = 1.0 - reduction;
body.velocity.x *= factor;
body.velocity.y *= factor;
body.velocity.z *= factor;
```

---

## 4. تأثير ماغنوس لدوران الكرة (Magnus Effect)
عندما تدور الكرة حول محورها أثناء تحليقها، فإنها تزيح الهواء حولها مما يولد ضغطاً مختلفاً يتسبب في انحناء مسارها (يرفعها إذا كان الدوران للخلف Backspin).

* **المعادلة الرياضية المبسطة لقوة ماغنوس:**
  $$F_m \propto (\vec{\omega} \times \vec{v})$$
  *حيث $(\vec{\omega})$ هي السرعة الزاوية (Spin)، و $(\vec{v})$ السرعة الخطية.*
* **مكان التطبيق:** `PhysicsEngine.js -> _calcMagnusForce(body)`.
* **التنفيذ البرمجي:** يتم تفعيل مصفوفة الضرب التقاطعي (Cross Product) للسرعة الزاوية مع الخطية وإضافة قوة انحراف طفيفة.
```javascript
_calcMagnusForce(body) {
  // ثابت مصغر يمثل كثافة الهواء ولزوجته حول الكرة
  const kM = 0.00008;
  const w  = body.angularVelocity;
  const v  = body.velocity;
  
  // Cross product: (w x v)
  return {
    x: kM * (w.y * v.z - w.z * v.y),
    y: kM * (w.z * v.x - w.x * v.z), // القوة الرافعة الأساسية للـ Backspin
    z: kM * (w.x * v.y - w.y * v.x)
  };
}
```

---

## 5. التصادم النيوتني والارتداد (Collision & Restitution)
يعتمد النظام على فيزياء الجسم الصلب والتصادم المرن جزئياً (Inelastic Collision)، حيث تفقد الكرة جزءاً من طاقتها (الارتداد) ويتغير اتجاهها. وتم حديثاً إعادة بناء نظام الاحتكاك المماسي (Tangential Friction) ليحسب متجه الاحتكاك **قبل** تطبيق نبضة الارتداد (Pre-Impulse Velocity) لضمان دقة الفيزياء التامة ومنع توقف الكرة بشكل غير طبيعي.

* **خصائص الأسطح (Coefficients):** مكانها في الثوابت داخل `PhysicsEngine`.
  - أرضية باركيه الملعب: `RESTITUTION_FLOOR = 0.72`
  - اللوحة الزجاجية والدعامات: `RESTITUTION_BACKBOARD = 0.65` (يتم استخدام نظام `supportBoxes` الذي يضم اللوحة، العمود، الذراع الممتد، والدعامة المائلة باستخدام تداخل Sphere-AABB).
  - الطوق المعدني: `RESTITUTION_RIM = 0.55` (لتخفيف قفز الكرة عن الطوق وجعل التسجيل أكثر انسيابية).
* **مكان التطبيق:** `CollisionSystem.js`. يستخدم معادلات حل التداخل الهندسي لمعرفة مكان الاصطدام بدقة وتصحيحه (Penetration Resolution).
* **التنفيذ البرمجي لرد الفعل والاحتكاك (Impulse Resolution):**
```javascript
// التصادم مع اللوحة والدعامات كمثال (_checkSupportBoxes)
const vDotN = body.velocity.x * nx + body.velocity.y * ny + body.velocity.z * nz;
if (vDotN < 0) {
  // 1. حساب السرعة المماسية (Tangential) *قبل* تغيير السرعة
  const tx = body.velocity.x - vDotN * nx;
  const ty = body.velocity.y - vDotN * ny;
  const tz = body.velocity.z - vDotN * nz;
  
  // 2. تطبيق قانون الارتداد (Impulse)
  const impulse = -(1 + e) * vDotN;
  body.velocity.x += impulse * nx;
  body.velocity.y += impulse * ny;
  body.velocity.z += impulse * nz;

  // 3. تطبيق الاحتكاك المماسي بناءً على السرعة المماسية الصحيحة
  const tSpeed = Math.sqrt(tx * tx + ty * ty + tz * tz);
  if (tSpeed > 0.01) {
    const fi = Math.min(f * Math.abs(impulse), tSpeed);
    body.velocity.x -= (tx / tSpeed) * fi;
    // ...
  }
}
```

---

## 6. مسار الرمية الاستباقي (Trajectory Preview)
تظهر اللعبة خطاً متقطعاً (النقاط) قبل رمي الكرة لمساعدة اللاعب على توقع مسار التسديدة. هذا المسار ليس مجرد تقريب رسومي، بل هو **محاكاة فيزيائية دقيقة ومسبقة (Forward Simulation)** للمسار الذي ستتخذه الكرة في الفضاء بناءً على قوة الشحن والاتجاه.

* **آلية العمل الفيزيائية:**
  1. **تحديد الهدف الوهمي (Virtual Target):** يقوم نظام الـ `Game.js` بحساب نقطة الهدف بناءً على زاوية دوران اللاعب (Free Aiming) والمسافة الإجمالية للسلة.
  2. **حساب متجه السرعة الابتدائية ($v_0$):** تقوم دالة `calcShotVelocity` في `PhysicsEngine.js` بالعمل كحلّال باليستي (Ballistic Solver). حيث تحسب السرعة اللازمة (مقداراً واتجاهاً) للوصول من نقطة الإطلاق إلى نقطة الهدف الوهمي ضد تسارع الجاذبية، مع تعديل السرعة بناءً على نسبة قوة الشحن (Power) لإعطاء قوس رمي (Arc) مختلف.
  3. **المحاكاة الاستباقية (Trajectory Integration):** بمجرد الحصول على السرعة الابتدائية المتوقعة، تمرر إلى دالة `calcTrajectory`. هذه الدالة تقوم بعمل حلقة تكرارية (Loop) لمحاكاة الخطوات الزمنية (dt = 0.04s) المستقبلية. في كل خطوة، يتم تطبيق نفس الجاذبية ونفس **معادلة مقاومة الهواء (Aerodynamic Drag)** المستخدمة في المحرك الرئيسي، لضمان تطابق مسار النقاط مع المسار الحقيقي للكرة تماماً.

* **التنفيذ البرمجي لعملية المحاكاة الاستباقية:**
```javascript
// دالة calcTrajectory في PhysicsEngine.js
calcTrajectory(startPos, velocity, steps = 40, dt = 0.04) {
  const points = [];
  let px = startPos.x, py = startPos.y, pz = startPos.z;
  let vx = velocity.x, vy = velocity.y, vz = velocity.z;

  for (let i = 0; i < steps; i++) {
    points.push({ x: px, y: py, z: pz });
    // تطبيق الجاذبية
    vy -= this.GRAVITY * this.SCALE * dt;
    // تطبيق مقاومة الهواء المعقدة
    const speedWU = Math.sqrt(vx * vx + vy * vy + vz * vz);
    if (speedWU > 0.01) {
      // (نفس معادلة السحب الهوائي المطبقة على الكرة الحقيقية)
      // ... 
      vx *= factor; vy *= factor; vz *= factor;
    }
    // تحديث الموقع المستقبلي
    px += vx * dt; py += vy * dt; pz += vz * dt;
    
    if (py < 0) break; // التوقف عند الاصطدام بالأرض
  }
  return points;
}
```

---

## كيف تتصل هذه الأنظمة باللعبة؟

1. **`Game.js`**: يمد المحرك بالـ $dt$ وينادي `physics.step(dt)` في كل إطار زمني. كما يجمع مدخلات اللاعب ويحسب الهدف الوهمي (Virtual Target) بناءً على اتجاه دوران اللاعب (Free Aiming) بدلاً من الإجبار على التصويب نحو السلة.
2. **`BallPhysics.js`**: يدير الخصائص المادية للكرة ويبرمج قوة التسديد. يستخدم خوارزمية (Ballistic Shot Solver) لتحديد السرعة الفائقة بدقة ($v_0$) المطلوبة لإصابة الهدف الوهمي كمرجع للمحاكاة، مع الأخذ بالاعتبار نسبة قوة الرمية (Power).
3. **`CollisionSystem.js`**: يعمل كمراقب فيزيائي (Physics Observer) بعد كل خطوة للمحرك، حيث يتحقق من التقاطعات بين الأجسام البسيطة (الكرة مع `supportBoxes`، أو الكرة مع الطوق) ويطبق قوانين الاستجابة والارتداد مباشرةً.
