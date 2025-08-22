import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import Stats from 'stats.js'
import GUI from 'lil-gui'
import * as CANNON from 'cannon-es'

// App root
const app = document.querySelector<HTMLDivElement>('#app')!
app.classList.add('canvas-root')

// Renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
renderer.setSize(window.innerWidth, window.innerHeight)
renderer.shadowMap.enabled = true
renderer.outputColorSpace = THREE.SRGBColorSpace
app.appendChild(renderer.domElement)

// Scene and camera
const scene = new THREE.Scene()
scene.background = new THREE.Color(0x0b0e13)

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000)
camera.position.set(6, 4, 8)
scene.add(camera)

// Lighting
const hemi = new THREE.HemisphereLight(0xffffff, 0x223344, 0.6)
scene.add(hemi)

const dir = new THREE.DirectionalLight(0xffffff, 1.0)
dir.position.set(10, 12, 6)
dir.castShadow = true
dir.shadow.mapSize.set(2048, 2048)
dir.shadow.camera.near = 1
dir.shadow.camera.far = 50
scene.add(dir)

// Physics world
const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) })
world.broadphase = new CANNON.SAPBroadphase(world)
world.allowSleep = true

// Materials
const defaultMat = new CANNON.Material('default')
const defaultContact = new CANNON.ContactMaterial(defaultMat, defaultMat, {
  friction: 0.3,
  restitution: 0.2,
})
world.addContactMaterial(defaultContact)

// Ground
const groundSize = 200
const groundGeo = new THREE.PlaneGeometry(groundSize, groundSize)
const groundMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, metalness: 0.0, roughness: 1.0 })
const ground = new THREE.Mesh(groundGeo, groundMat)
ground.rotation.x = -Math.PI / 2
ground.receiveShadow = true
scene.add(ground)

const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: defaultMat })
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0)
world.addBody(groundBody)

// Grid and axes helpers
const grid = new THREE.GridHelper(200, 200, 0x666a73, 0x343843)
scene.add(grid)
const axes = new THREE.AxesHelper(2)
scene.add(axes)

// Orbit controls
const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.dampingFactor = 0.05
controls.maxPolarAngle = Math.PI * 0.49

// Stats HUD
const stats = new Stats()
stats.showPanel(0)
stats.dom.classList.add('stats')
document.body.appendChild(stats.dom)

// Developer HUD
const hud = document.createElement('div')
hud.className = 'hud'
hud.innerHTML = `
  <div class="pill" id="mode-pill">Mode: Orbit</div>
  <div class="pill" id="time-pill">Time x1.0</div>
  <div class="pill" id="bodies-pill">Bodies 0</div>
`
document.body.appendChild(hud)

const modePill = document.getElementById('mode-pill')!
const timePill = document.getElementById('time-pill')!
const bodiesPill = document.getElementById('bodies-pill')!

// Debug GUI
const gui = new GUI({ title: 'Developer', width: 320 })
;(gui.domElement as HTMLElement).classList.add('debug-gui')
const params = {
  pause: false,
  timeScale: 1.0,
  spawnSphere: () => spawnSphere(),
  spawnBox: () => spawnBox(),
  clearDynamic: () => clearDynamicBodies(),
  gravityY: -9.81,
  wireframe: false,
  mode: 'Orbit' as 'Orbit' | 'Fly',
}

gui.add(params, 'pause').name('Pause (P)')
const timeScaleController = gui.add(params, 'timeScale', 0.1, 4.0, 0.1).name('Time Scale (Shift+Wheel)')
const gravityController = gui.add(params, 'gravityY', -30, 0, 0.1).name('Gravity Y')
const wireframeController = gui.add(params, 'wireframe').name('Wireframe')
const modeController = gui.add(params, 'mode', ['Orbit', 'Fly']).name('Camera Mode')
const spawners = gui.addFolder('Spawn')
spawners.add(params, 'spawnSphere').name('Sphere (1)')
spawners.add(params, 'spawnBox').name('Box (2)')
spawners.add(params, 'clearDynamic').name('Clear (C)')
spawners.open()

gravityController.onChange((v: number) => {
  world.gravity.set(0, v, 0)
})
wireframeController.onChange((v: boolean) => {
  groundMat.wireframe = v
})
modeController.onChange((v: 'Orbit' | 'Fly') => {
  setCameraMode(v)
})

// Materials for meshes
const standardMat = new THREE.MeshStandardMaterial({ color: 0x9bb1ff, roughness: 0.5, metalness: 0.1 })
const boxMat = new THREE.MeshStandardMaterial({ color: 0xffb86b, roughness: 0.6, metalness: 0.05 })

// Dynamic bodies registry
const dynamic: Array<{ mesh: THREE.Object3D; body: CANNON.Body }> = []

function spawnSphere(position?: THREE.Vector3) {
  const radius = THREE.MathUtils.randFloat(0.2, 0.6)
  const sphereGeo = new THREE.SphereGeometry(radius, 32, 32)
  const mesh = new THREE.Mesh(sphereGeo, standardMat.clone())
  mesh.castShadow = true
  mesh.position.copy(position ?? new THREE.Vector3(0, 5, 0))
  scene.add(mesh)

  const shape = new CANNON.Sphere(radius)
  const body = new CANNON.Body({ mass: 1, shape, material: defaultMat })
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z)
  world.addBody(body)

  dynamic.push({ mesh, body })
}

function spawnBox(position?: THREE.Vector3) {
  const size = new THREE.Vector3().setScalar(THREE.MathUtils.randFloat(0.3, 0.8))
  const geo = new THREE.BoxGeometry(size.x, size.y, size.z)
  const mesh = new THREE.Mesh(geo, boxMat.clone())
  mesh.castShadow = true
  mesh.position.copy(position ?? new THREE.Vector3(0, 6, 0))
  mesh.rotation.set(Math.random(), Math.random(), Math.random())
  scene.add(mesh)

  const half = new CANNON.Vec3(size.x / 2, size.y / 2, size.z / 2)
  const shape = new CANNON.Box(half)
  const body = new CANNON.Body({ mass: 2, shape, material: defaultMat })
  body.position.set(mesh.position.x, mesh.position.y, mesh.position.z)
  body.quaternion.setFromEuler(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z)
  world.addBody(body)

  dynamic.push({ mesh, body })
}

function clearDynamicBodies() {
  for (const { mesh, body } of dynamic) {
    scene.remove(mesh)
    world.removeBody(body)
  }
  dynamic.length = 0
}

// Raycasting for spawn at pointer
const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()
function updatePointerFromEvent(event: MouseEvent) {
  pointer.x = (event.clientX / window.innerWidth) * 2 - 1
  pointer.y = -(event.clientY / window.innerHeight) * 2 + 1
}

function getSpawnPointFromPointer(): THREE.Vector3 | null {
  raycaster.setFromCamera(pointer, camera)
  const intersects = raycaster.intersectObject(ground, false)
  if (intersects.length > 0) {
    const p = intersects[0].point.clone()
    p.y += 0.5
    return p
  }
  return null
}

// Fly (first-person) controls
let isFlyMode = false
const flyState = {
  velocity: new THREE.Vector3(),
  acceleration: 30,
  damping: 0.92,
  speedBoost: 3,
  yaw: 0,
  pitch: 0,
  lookSensitivity: 0.0025,
}

const keyState: Record<string, boolean> = {}
window.addEventListener('keydown', (e) => {
  keyState[e.code] = true
  if (e.code === 'KeyP') params.pause = !params.pause
  if (e.code === 'Digit1') params.spawnSphere()
  if (e.code === 'Digit2') params.spawnBox()
  if (e.code === 'KeyC') params.clearDynamic()
})
window.addEventListener('keyup', (e) => (keyState[e.code] = false))

function setCameraMode(mode: 'Orbit' | 'Fly') {
  isFlyMode = mode === 'Fly'
  modePill.textContent = `Mode: ${mode}`
  if (isFlyMode) {
    controls.enabled = false
    document.body.requestPointerLock()
  } else {
    if (document.pointerLockElement) document.exitPointerLock()
    controls.enabled = true
  }
}

document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement === document.body) {
    isFlyMode = true
    modePill.textContent = 'Mode: Fly'
  } else {
    isFlyMode = false
    modePill.textContent = 'Mode: Orbit'
    controls.enabled = true
  }
})

document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!isFlyMode) return
  flyState.yaw -= e.movementX * flyState.lookSensitivity
  flyState.pitch -= e.movementY * flyState.lookSensitivity
  flyState.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, flyState.pitch))
})

document.addEventListener('wheel', (e: WheelEvent) => {
  if (e.shiftKey) {
    params.timeScale = THREE.MathUtils.clamp(params.timeScale + Math.sign(e.deltaY) * -0.1, 0.1, 4)
    timeScaleController.updateDisplay()
  }
})

renderer.domElement.addEventListener('mousedown', (e) => {
  updatePointerFromEvent(e)
  if (e.button === 0) {
    const p = getSpawnPointFromPointer()
    if (p) spawnSphere(p)
  } else if (e.button === 2) {
    const p = getSpawnPointFromPointer()
    if (p) spawnBox(p)
  }
})
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault())

function updateFlyControls(dt: number) {
  const forward = new THREE.Vector3(
    -Math.sin(flyState.yaw) * Math.cos(flyState.pitch),
    Math.sin(flyState.pitch),
    -Math.cos(flyState.yaw) * Math.cos(flyState.pitch)
  )
  const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward).normalize()

  let accel = new THREE.Vector3()
  if (keyState['KeyW']) accel.add(forward)
  if (keyState['KeyS']) accel.sub(forward)
  if (keyState['KeyD']) accel.add(right)
  if (keyState['KeyA']) accel.sub(right)
  if (keyState['Space']) accel.add(up)
  if (keyState['ShiftLeft']) accel.sub(up)

  const boost = keyState['ControlLeft'] ? flyState.speedBoost : 1
  if (accel.lengthSq() > 0) accel.normalize().multiplyScalar(flyState.acceleration * boost)

  flyState.velocity.addScaledVector(accel, dt)
  flyState.velocity.multiplyScalar(flyState.damping)

  camera.position.addScaledVector(flyState.velocity, dt)

  const lookTarget = new THREE.Vector3(
    camera.position.x - Math.sin(flyState.yaw) * Math.cos(flyState.pitch),
    camera.position.y + Math.sin(flyState.pitch),
    camera.position.z - Math.cos(flyState.yaw) * Math.cos(flyState.pitch)
  )
  camera.lookAt(lookTarget)
}

// Resize handling
function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight
  camera.updateProjectionMatrix()
  renderer.setSize(window.innerWidth, window.innerHeight)
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
}
window.addEventListener('resize', onResize)

// Clock
const clock = new THREE.Clock()
let accumulator = 0
const fixedTimeStep = 1 / 120

// Animation loop
function tick() {
  stats.begin()
  const dt = Math.min(clock.getDelta(), 0.05) * (params.pause ? 0 : params.timeScale)
  timePill.textContent = `Time x${params.timeScale.toFixed(1)}`

  // Physics
  accumulator += dt
  while (accumulator >= fixedTimeStep) {
    world.step(fixedTimeStep)
    accumulator -= fixedTimeStep
  }

  // Sync bodies -> meshes
  for (const { mesh, body } of dynamic) {
    ;(mesh as THREE.Mesh).position.set(body.position.x, body.position.y, body.position.z)
    ;(mesh as THREE.Mesh).quaternion.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w)
  }
  bodiesPill.textContent = `Bodies ${dynamic.length}`

  // Controls
  if (isFlyMode) updateFlyControls(dt)
  else controls.update()

  // Render
  renderer.render(scene, camera)
  stats.end()
  requestAnimationFrame(tick)
}

// Initial content
for (let i = 0; i < 8; i++) spawnSphere(new THREE.Vector3(Math.random() * 2 - 1, 5 + i * 0.3, Math.random() * 2 - 1))
for (let i = 0; i < 4; i++) spawnBox(new THREE.Vector3(Math.random() * 2 - 1, 7 + i * 0.5, Math.random() * 2 - 1))

// Start
tick()

// Shortcuts for camera mode
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF') setCameraMode('Fly')
  if (e.code === 'KeyO') setCameraMode('Orbit')
})
