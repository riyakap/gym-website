(function(){
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const form = $('#intake-form');
  const calcOut = $('#calc-output');
  const planOut = $('#plan-output');
  const resetBtn = $('#reset-btn');

  const imperialFields = $('#imperial-fields');
  const metricFields = $('#metric-fields');
  const lossRateField = $('#loss-rate-field');
  const surplusField = $('#surplus-field');

  // Restore state
  try{
    const saved = JSON.parse(localStorage.getItem('gymcoach_state')||'null');
    if(saved){
      // gender
      const g = saved.gender || 'female';
      const gRadio = form.querySelector(`input[name="gender"][value="${g}"]`);
      if(gRadio) gRadio.checked = true;
      // units
      const u = saved.units || 'imperial';
      const uRadio = form.querySelector(`input[name="units"][value="${u}"]`);
      if(uRadio) uRadio.checked = true;
      toggleUnits(u);
      // values
      for(const [k,v] of Object.entries(saved.values||{})){
        const el = form.querySelector(`[name="${k}"]`);
        if(el) el.value = v;
      }
      // goal specifics
      const goal = saved.goal || 'lose';
      const goalRadio = form.querySelector(`input[name="goal"][value="${goal}"]`);
      if(goalRadio) goalRadio.checked = true;
      toggleGoal(goal);
    }
  }catch(e){/* ignore */}

  // Listeners
  form.units.forEach?.call?.(null);
  $$('#intake-form input[name="units"]').forEach(r=>r.addEventListener('change', (e)=>{
    toggleUnits(e.target.value);
  }));
  $$('#intake-form input[name="goal"]').forEach(r=>r.addEventListener('change', (e)=>{
    toggleGoal(e.target.value);
  }));

  resetBtn.addEventListener('click', ()=>{
    localStorage.removeItem('gymcoach_state');
    form.reset();
    toggleUnits('imperial');
    toggleGoal('lose');
    calcOut.innerHTML = '';
    planOut.innerHTML = '';
  });

  form.addEventListener('submit', (e)=>{
    e.preventDefault();
    const data = readForm();
    if(!data) return;
    const metrics = computeMetrics(data);
    renderResults(metrics);
    renderPlan(data, metrics);
    saveState(data);
    document.getElementById('results').scrollIntoView({behavior:'smooth'});
  });

  function toggleUnits(units){
    if(units==='metric'){
      imperialFields.classList.add('hidden');
      metricFields.classList.remove('hidden');
    }else{
      metricFields.classList.add('hidden');
      imperialFields.classList.remove('hidden');
    }
  }
  function toggleGoal(goal){
    if(goal==='lose'){
      lossRateField.classList.remove('hidden');
      surplusField.classList.add('hidden');
    }else if(goal==='gain'){
      lossRateField.classList.add('hidden');
      surplusField.classList.remove('hidden');
    }else{ // both
      lossRateField.classList.add('hidden');
      surplusField.classList.add('hidden');
    }
  }

  function readForm(){
    const gender = (form.querySelector('input[name="gender"]:checked')||{}).value;
    const units  = (form.querySelector('input[name="units"]:checked')||{}).value || 'imperial';
    const age    = +form.age.value;
    const activity = form.activity.value;
    const goal   = (form.querySelector('input[name="goal"]:checked')||{}).value;

    let heightCm, weightKg;
    if(units==='imperial'){
      const ft = +form.heightFt.value; const inch = +form.heightIn.value;
      const lb = +form.weightLb.value;
      if(!(ft>=3 && ft<=8) || !(inch>=0 && inch<=11) || !(lb>=60 && lb<=600)){
        alert('Please check height/weight values.'); return null;
      }
      heightCm = (ft*12 + inch) * 2.54;
      weightKg = lb * 0.45359237;
    }else{
      heightCm = +form.heightCm.value; weightKg = +form.weightKg.value;
      if(!(heightCm>=120 && heightCm<=230) || !(weightKg>=30 && weightKg<=300)){
        alert('Please check metric height/weight values.'); return null;
      }
    }

    const lossRate = +form.lossRate?.value || 1; // lb/week
    const surplus  = +form.surplus?.value || 250; // kcal/day

    return {gender, units, age, activity, goal, heightCm, weightKg, lossRate, surplus,
            raw:{heightFt:form.heightFt?.value, heightIn:form.heightIn?.value, weightLb:form.weightLb?.value,
                 heightCm:form.heightCm?.value, weightKg:form.weightKg?.value}};
  }

  function activityMult(level){
    return ({
      sedentary:1.2,
      light:1.375,
      moderate:1.55,
      active:1.725,
      very_active:1.9,
      extra_active:2.0
    })[level] || 1.55;
  }

  function bmrMifflin({gender, age, heightCm, weightKg}){
    // Mifflin–St Jeor: (10×kg)+(6.25×cm)−(5×age) + s ; male s=+5, female s=−161, neutral s=−78
    const s = gender==='male' ? 5 : (gender==='female' ? -161 : -78);
    return (10*weightKg) + (6.25*heightCm) - (5*age) + s;
  }

  function computeMetrics(data){
    const bmr = bmrMifflin(data);
    const tdee = bmr * activityMult(data.activity);

    let targetCals = tdee;
    let notes = [];

    if(data.goal==='lose'){
      const dailyDeficit = Math.min(2, Math.max(0.25, data.lossRate)) * 500; // 1lb≈3500kcal → 500/day
      targetCals = Math.max(1200, tdee - dailyDeficit);
      notes.push(`Deficit ≈ ${Math.round(dailyDeficit)} kcal/day for ${data.lossRate} lb/week.`);
    }else if(data.goal==='gain'){
      targetCals = tdee + data.surplus;
      notes.push(`Surplus ≈ +${data.surplus} kcal/day.`);
    }else{
      // Recomp: small deficit with high protein
      targetCals = tdee - 250;
      notes.push('Recomp: small ~250 kcal/day deficit with high protein.');
    }

    // Protein
    const weightLb = data.weightKg * 2.20462;
    let proteinG = Math.round(weightLb * (data.goal==='gain' || data.goal==='both' ? 1.0 : 0.8));
    if(data.goal==='gain') proteinG = Math.round(Math.max(proteinG, weightLb * 0.9));
    if(data.goal==='both') proteinG = Math.round(weightLb * 1.0);

    return { bmr:Math.round(bmr), tdee:Math.round(tdee), targetCals:Math.round(targetCals), proteinG:Math.round(proteinG), notes };
  }

  function renderResults(m){
    calcOut.innerHTML = `
      ${tile('BMR','Basal Metabolic Rate', `${m.bmr} kcal`)}
      ${tile('TDEE','Maintenance Calories', `${m.tdee} kcal`)}
      ${tile('Target','Daily Target', `${m.targetCals} kcal`)}
      ${tile('Protein','Daily Protein', `${m.proteinG} g`)}
      <div class="result"><strong>Notes</strong><p>${m.notes.join(' ')}</p></div>
    `;
  }

  function tile(title, subtitle, value){
    return `<div class="result"><h3>${title}</h3><div class="big">${value}</div><div class="muted small">${subtitle}</div></div>`;
  }

  function renderPlan(data, metrics){
    const g = data.gender;
    const goal = data.goal;

    const absMale = [
      'Cable Crunch — 3×12', 'Weighted Sit-ups — 3×12', 'Hanging Leg Raises — 3×10', 'Russian Twists — 3×20', 'Leg Raises — 3×12'
    ];
    const absFemale = [
      'Weighted Sit-ups — 3×12', 'Hanging Leg Raises — 3×10', 'Weighted Suitcases — 3×12/side', 'Leg Raises — 3×12', 'Weighted Plank — 3×:45'
    ];

    const maleSplit = {
      'Leg Day':[ 'Bulgarian Split Squat — 3×10/leg', 'Leg Press — 4×10', 'Romanian Deadlift — 4×8', 'Leg Extension — 3×12', 'Calf Raises — 4×12' ],
      'Push':[ 'Bench Press — 4×6–8', 'Tricep Extensions — 3×12', 'Lateral Raises — 3×15', 'Chest Fly — 3×12', 'Push-ups — 3×AMRAP' ],
      'Pull':[ 'Lat Pulldown — 4×10', 'Low Row — 4×10', 'Face Pulls — 3×15', 'Bicep Curls — 3×12', 'Pull-ups — 3×AMRAP' ],
      'Abs': absMale
    };

    const femaleSplit = {
      'Leg Day':[ 'Bulgarian Split Squats — 3×10/leg', 'Leg Extensions — 3×12', 'Hip Thrust — 4×10', 'Abductors — 3×15', 'Goblet Squat — 3×10' ],
      'Back + Bi':[ 'Preacher Curls — 3×10', 'Hammer Curls — 3×10', 'Lat Pulldown — 4×10', 'Low Row — 4×10', 'Face Pulls — 3×15' ],
      'Shoulder + Tri':[ 'Overhead Tricep Extension — 3×12', 'Lateral Raises — 3×15', 'Tricep Pushdown — 3×12', 'Shoulder Press — 4×8–10', 'Tricep Dip — 3×AMRAP' ],
      'Abs': absFemale
    };

    const split = g==='male' ? maleSplit : (g==='female' ? femaleSplit : {...femaleSplit});

    const days = [
      {day:'Day 1', key:'Leg Day'},
      {day:'Day 2', key:g==='male'?'Push':'Back + Bi'},
      {day:'Day 3', key:g==='male'?'Pull':'Shoulder + Tri'},
      {day:'Day 4', key:'Abs'}
    ];

    // Add cardio emphasis for weight loss or recomp
    const cardio = goal!=='gain';

    planOut.innerHTML = days.map(({day,key})=>{
      const lifts = split[key] || [];
      return `<article class="workout"><h3>${day} • ${key}</h3>
        ${cardio?'<p class="muted small">+ Cardio: 30 minutes (Stairmaster 5 / 12–3–30 / Bike / Elliptical / Swim)</p>':''}
        <ul>${lifts.map(li=>`<li>${li}</li>`).join('')}</ul>
      </article>`;
    }).join('');
  }

  function saveState(d){
    const values = {};
    ['heightFt','heightIn','weightLb','heightCm','weightKg','age','activity','lossRate','surplus']
      .forEach(k=>{ const el=form.querySelector(`[name="${k}"]`); if(el) values[k]=el.value; });
    const state = { gender:d.gender, units:d.units, goal:d.goal, values };
    localStorage.setItem('gymcoach_state', JSON.stringify(state));
  }
})();
