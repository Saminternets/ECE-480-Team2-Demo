/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Environment, 
  ContactShadows, 
  Html, 
  Float,
  Text,
  Line,
  Sphere
} from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Info, 
  Play, 
  Pause, 
  Zap, 
  Cpu, 
  Radio, 
  Activity, 
  ChevronRight,
  Maximize2
} from 'lucide-react';
import { cn } from '@/src/lib/utils';

// --- Types ---

type SimulationScenario = 'NOMINAL' | 'HIGH_TRAFFIC' | 'SENSOR_ANOMALY';

interface ScenarioConfig {
  id: SimulationScenario;
  name: string;
  description: string;
  packetSpeed: number;
  packetDensity: number;
  avgThroughput: number; // in Mbps
  cpuLoad: string;
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: 'NOMINAL',
    name: 'Nominal Operation',
    description: 'Stabilized sensor fusion at ~40 Mbps per channel.',
    packetSpeed: 1.5,
    packetDensity: 2,
    avgThroughput: 160, // 4 * 40
    cpuLoad: '24%'
  },
  {
    id: 'HIGH_TRAFFIC',
    name: 'High Traffic Load',
    description: 'Saturation at 100 Mbps per input channel.',
    packetSpeed: 3.5,
    packetDensity: 4,
    avgThroughput: 400, // 4 * 100
    cpuLoad: '89%'
  },
  {
    id: 'SENSOR_ANOMALY',
    name: 'Sensor Anomaly',
    description: 'Fault on CH3; others at 80 Mbps saturation.',
    packetSpeed: 1.2,
    packetDensity: 2,
    avgThroughput: 245, // 3 * 80 + ~5
    cpuLoad: '45%'
  }
];

interface ComponentInfo {
  id: string;
  name: string;
  description: string;
  position: [number, number, number];
  size: [number, number, number];
  color: string;
  details: string[];
}

// --- Constants & Data ---

const PCB_COMPONENTS: ComponentInfo[] = [
  {
    id: 'phy1',
    name: 'BroadR-Reach PHY (CH1)',
    description: 'TI DP83TC814: These automotive-qualified physical layer transceivers convert raw 100BASE-T1 differential signals from sensors into digital RMII data for the switch.',
    position: [-1, 0.05, 0.6],
    size: [0.3, 0.05, 0.3],
    color: '#000000',
    details: ['RMII Interface', '100 Mbps bandwidth', 'AEC-Q100 Grade 3', 'Controlled impedance routing']
  },
  {
    id: 'phy2',
    name: 'BroadR-Reach PHY (CH2)',
    description: 'TI DP83TC814: Successfully arbitrates concurrent data streams from the second sensor input without packet loss or latency degradation.',
    position: [-1, 0.05, 0.2],
    size: [0.3, 0.05, 0.3],
    color: '#000000',
    details: ['RMII decoding', '50 MHz Ref Clock', 'BroadR-Reach Standard']
  },
  {
    id: 'phy3',
    name: 'BroadR-Reach PHY (CH3)',
    description: 'TI DP83TC814: Part of the consolidated 4-channel gateway, replacing the legacy multi-board $200 modules.',
    position: [-1, 0.05, -0.2],
    size: [0.3, 0.05, 0.3],
    color: '#000000',
    details: ['Low-cost mitigation', 'AEC-Q100 Certified', 'RMII output']
  },
  {
    id: 'phy4',
    name: 'BroadR-Reach PHY (CH4)',
    description: 'TI DP83TC814: Final input channel performing analog-to-digital domain translation for the switching IC.',
    position: [-1, 0.05, -0.6],
    size: [0.3, 0.05, 0.3],
    color: '#000000',
    details: ['RMII Decoding', 'Automotive Grade 3', '50 MHz Timing Sync']
  },
  {
    id: 'switch',
    name: 'NXP Network Switch IC',
    description: 'NXP SJA1105PELY: The core digital aggregator. It accepts four 100 Mbps RMII inputs, arbitrates data streams, and manages a high-speed 1 Gbps RGMII uplink.',
    position: [0.2, 0.05, 0],
    size: [0.6, 0.05, 0.6],
    color: '#1a1a1a',
    details: ['VLAN Tagging ready', 'Frame Arbitration', 'RMII to RGMII bridging', 'Lowest cost vs feature set']
  },
  {
    id: 'gigabit_phy',
    name: 'Gigabit Ethernet PHY',
    description: 'TI DP83867: High-immunity transceiver that converts the Switch\'s digital RGMII interface into 1000BASE-T physical layer signals.',
    position: [1.2, 0.05, 0],
    size: [0.4, 0.05, 0.4],
    color: '#000000',
    details: ['RGMII Support', '1000 Mbps capacity', 'Pulse Transformer driver', 'Low ripple requirement']
  },
  {
    id: 'clock',
    name: 'Clock Fanout Buffer',
    description: 'LMK00105: Manages clock signals shared between the BroadR-Reach PHYs to esnure RMII timing',
    position: [0.1, 0.05, 0.8],
    size: [0.25, 0.05, 0.25],
    color: '#222',
    details: ['CMOS input', 'Low Skew Distribution', 'Skew Control']
  },
  {
    id: 'power',
    name: 'DC/DC Power Subsystem',
    description: 'Regulators for 1V, 1.2V, 2.5V, and 3.3V rails. Designed to operate from 9V-36V automotive supply with strict EMI/Ripple control.',
    position: [1.2, 0.05, 0.8],
    size: [0.5, 0.05, 0.4],
    color: '#333',
    details: ['LMR51430 (2.5V)', 'LM60430 (1.2V)', 'LMR36020 (1V)', 'LMQ66410 (3.3V)']
  },
  {
    id: 'rj45',
    name: 'Gigabit RJ45 (Amphenol)',
    description: 'Output port with integrated magnetics providing galvanic isolation and EMI suppression for the aggregated gigabit data stream.',
    position: [2, 0.2, 0],
    size: [0.8, 0.4, 0.6],
    color: '#cccccc',
    details: ['Integrated Magnetics', 'EMI suppression', '1 Gbps throughput', 'Shielded Connector']
  }
];

// Data paths for flow visualization
const FLOW_PATHS = [
  // Sensor 1 to Switch
  [ {pos: [-3, 0.5, 0.6], type: 'input'}, {pos: [-2.2, 0.1, 0.6], type: 'pcb'}, {pos: [-1, 0.1, 0.6], type: 'phy'}, {pos: [0.2, 0.1, 0], type: 'switch'} ],
  // Sensor 2 to Switch
  [ {pos: [-3, 0.5, 0.2], type: 'input'}, {pos: [-2.2, 0.1, 0.2], type: 'pcb'}, {pos: [-1, 0.1, 0.2], type: 'phy'}, {pos: [0.2, 0.1, 0], type: 'switch'} ],
  // Sensor 3 to Switch
  [ {pos: [-3, 0.5, -0.2], type: 'input'}, {pos: [-2.2, 0.1, -0.2], type: 'pcb'}, {pos: [-1, 0.1, -0.2], type: 'phy'}, {pos: [0.2, 0.1, 0], type: 'switch'} ],
  // Sensor 4 to Switch
  [ {pos: [-3, 0.5, -0.6], type: 'input'}, {pos: [-2.2, 0.1, -0.6], type: 'pcb'}, {pos: [-1, 0.1, -0.6], type: 'phy'}, {pos: [0.2, 0.1, 0], type: 'switch'} ],
  // Switch to Export
  [ {pos: [0.2, 0.1, 0], type: 'switch'}, {pos: [1.2, 0.1, 0], type: 'phy'}, {pos: [2.5, 0.1, 0], type: 'output'} ]
];

// --- Sub-components ---

function IC({ config, onClick, hoveredId, setHoveredId }: { 
  config: ComponentInfo; 
  onClick: (id: string) => void;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
}) {
  const isHovered = hoveredId === config.id;
  
  return (
    <group 
      position={config.position} 
      onPointerOver={() => setHoveredId(config.id)}
      onPointerOut={() => setHoveredId(null)}
      onClick={() => onClick(config.id)}
    >
      <mesh>
        <boxGeometry args={config.size} />
        <meshStandardMaterial color={isHovered ? '#ff3e00' : config.color} metalness={0.8} roughness={0.2} />
      </mesh>
      
      {/* Pins visual */}
      <mesh position={[0, -config.size[1]/2, 0]}>
        <boxGeometry args={[config.size[0] + 0.05, 0.01, config.size[2] + 0.05]} />
        <meshStandardMaterial color="#888" metalness={1} />
      </mesh>

      {/* Label */}
      <Text
        position={[0, config.size[1]/2 + 0.01, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.06}
        color="white"
        anchorX="center"
        anchorY="middle"
      >
        {config.id.toUpperCase()}
      </Text>
    </group>
  );
}

function DataPacket({ path, speed = 1, delay = 0 }: { path: any[]; speed?: number; delay?: number }) {
  const sphereRef = useRef<THREE.Mesh>(null!);
  const [progress, setProgress] = useState(0);
  
  const points = useMemo(() => {
    return path.map(p => new THREE.Vector3(...p.pos));
  }, [path]);

  const curve = useMemo(() => {
    return new THREE.CatmullRomCurve3(points);
  }, [points]);

  useFrame((state, delta) => {
    // Only animate if simulation is running? Parent handles it by mounting/unmounting
    let nextProgress = progress + (delta * speed * 0.2);
    if (nextProgress > 1) nextProgress = 0;
    setProgress(nextProgress);
    
    if (sphereRef.current) {
      const point = curve.getPointAt(nextProgress);
      sphereRef.current.position.copy(point);
    }
  });

  return (
    <Sphere ref={sphereRef} args={[0.03, 8, 8]}>
      <meshBasicMaterial color="#10b981" transparent opacity={0.8} />
    </Sphere>
  );
}

function SensorModel({ position, name, type }: { position: [number, number, number], name: string, type: 'lidar' | 'radar' }) {
  return (
    <group position={position}>
      <Float speed={2} rotationIntensity={0.5} floatIntensity={0.5}>
        <mesh>
          {type === 'lidar' ? <cylinderGeometry args={[0.3, 0.3, 0.4, 16]} /> : <boxGeometry args={[0.4, 0.3, 0.1]} />}
          <meshStandardMaterial color={type === 'lidar' ? '#333' : '#555'} metalness={0.6} roughness={0.3} />
        </mesh>
        <Text
          position={[0, 0.3, 0]}
          fontSize={0.1}
          color="#aaa"
          anchorX="center"
        >
          {name}
        </Text>
      </Float>
      {/* Ground stand */}
      <mesh position={[0, -0.4, 0]}>
        <cylinderGeometry args={[0.1, 0.2, 0.5]} />
        <meshStandardMaterial color="#222" />
      </mesh>
    </group>
  );
}

function MonitorModel({ position, throughput, scenario, simMode }: { position: [number, number, number], throughput: number, scenario: SimulationScenario, simMode: boolean }) {
  // Generate random "objects" for the radar sweep
  const dots = useMemo(() => {
    return Array.from({ length: 8 }).map(() => ({
      x: Math.random() * 100 - 50,
      y: Math.random() * 100 - 50,
      size: Math.random() * 3 + 2,
      opacity: Math.random() * 0.5 + 0.3
    }));
  }, [scenario]); // Re-randomize when scenario changes

  return (
    <group position={position} rotation={[0, -Math.PI / 3.5, 0]}>
      {/* Screen Frame */}
      <mesh castShadow>
        <boxGeometry args={[2.5, 1.7, 0.12]} />
        <meshStandardMaterial color="#222" roughness={0.1} metalness={0.9} />
      </mesh>
      
      {/* Stand */}
      <mesh position={[0, -1.1, 0]}>
        <cylinderGeometry args={[0.08, 0.15, 0.6]} />
        <meshStandardMaterial color="#333" />
      </mesh>
      <mesh position={[0, -1.4, 0]}>
        <cylinderGeometry args={[0.7, 0.7, 0.05]} />
        <meshStandardMaterial color="#222" />
      </mesh>

      {/* Screen Surface */}
      <mesh position={[0, 0, 0.061]}>
        <planeGeometry args={[2.35, 1.55]} />
        <meshStandardMaterial color="#000" emissive="#051015" emissiveIntensity={0.5} />
        <Html 
          transform 
          position={[0, 0, 0.01]} 
          scale={0.5} 
          distanceFactor={6}
        >
          <div className="w-[450px] h-[300px] bg-[#020508] flex flex-col pointer-events-none p-5 select-none rounded border-4 border-emerald-500/30 shadow-[inset_0_0_80px_rgba(16,185,129,0.2)] relative scale-[1.2]">
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent pointer-events-none rounded" />
            
            {/* Top Bar */}
            <div className="flex justify-between items-center border-b-2 border-emerald-500/40 pb-3 mb-3 relative z-10">
               <div className="flex items-center gap-3">
                 <div className={cn("w-3 h-3 rounded-full", simMode ? "bg-emerald-500 animate-pulse shadow-[0_0_10px_#10b981]" : "bg-white/20")}></div>
                 <span className="text-[14px] font-mono font-bold text-white uppercase tracking-[0.2em]">GATEWAY_MONITOR</span>
               </div>
               <span className="text-[11px] font-mono text-emerald-400 uppercase font-bold">1.0 Gbps RGMII</span>
            </div>

            <div className="flex-1 flex gap-5 overflow-hidden relative z-10">
               {/* Radar Column (Enlarged) */}
               <div className="w-[55%] flex flex-col gap-3 h-full">
                  <div className="flex-1 bg-black/60 rounded-lg border-2 border-white/10 relative overflow-hidden flex items-center justify-center shadow-inner">
                    {/* Radar Circles (Upscaled) */}
                    <div className="absolute w-[220px] h-[220px] border border-emerald-500/10 rounded-full"></div>
                    <div className="absolute w-[150px] h-[150px] border border-emerald-500/10 rounded-full"></div>
                    <div className="absolute w-[80px] h-[80px] border border-emerald-500/10 rounded-full"></div>
                    <div className="absolute w-full h-[1px] bg-emerald-500/10"></div>
                    <div className="absolute w-[1px] h-full bg-emerald-500/10"></div>
                    
                    {/* Radar Sweep */}
                    {simMode && (
                      <motion.div 
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 4, ease: "linear" }}
                        className="absolute w-full h-full origin-center flex items-center justify-center"
                      >
                         <div className="w-1/2 h-full bg-gradient-to-r from-emerald-500/20 to-transparent origin-left rotate-90" style={{ clipPath: 'polygon(0 45%, 100% 0, 100% 100%, 0 55%)' }}></div>
                      </motion.div>
                    )}

                    {/* Detected Objects */}
                    {simMode && dots.map((dot, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 4, delay: i * 0.2 }}
                        style={{
                          position: 'absolute',
                          left: `${50 + dot.x}%`,
                          top: `${50 + dot.y}%`,
                          width: dot.size,
                          height: dot.size,
                          backgroundColor: i % 2 === 0 ? '#10b981' : '#a855f7',
                          borderRadius: '50%',
                          boxShadow: `0 0 10px ${i % 2 === 0 ? '#10b981' : '#a855f7'}`
                        }}
                      />
                    ))}
                    
                    <span className="absolute bottom-2 left-2 text-[8px] font-mono text-emerald-400/50">FUSION_AGGR_MAP</span>
                  </div>
                  
                  <div className="h-16 bg-emerald-500/5 rounded border-2 border-emerald-500/20 p-2 flex flex-col justify-center shadow-lg">
                    <span className="text-[8px] font-mono text-white/40 uppercase mb-0.5 font-bold">AVG_RATE</span>
                    <div className="text-2xl font-bold text-white font-mono tracking-tighter tabular-nums leading-none flex items-baseline gap-1.5">
                      {throughput.toFixed(1)} <span className="text-[11px] text-emerald-400">Mbps</span>
                    </div>
                  </div>
               </div>

               {/* Stats Column (Refined) */}
               <div className="w-[45%] flex flex-col gap-3 h-full">
                  <div className="bg-emerald-500/10 border-2 border-emerald-500/30 rounded p-3 flex flex-col gap-2 shadow-lg">
                    <div className="flex justify-between text-[10px] font-mono uppercase text-white/50 font-bold">
                      <span>RGMII Occupancy</span>
                      <span className="text-emerald-400">{((throughput / 1000) * 100).toFixed(1)}%</span>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                       <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: `${(throughput / 1000) * 100}%` }}
                        className="h-full bg-emerald-500 shadow-[0_0_10px_#10b981]"
                       />
                    </div>
                  </div>

                  <div className="flex-1 bg-black/80 rounded border-2 border-white/10 p-3 font-mono text-[9px] overflow-hidden flex flex-col gap-2 text-white/80 shadow-inner">
                    <span className="text-emerald-500/70 border-b border-white/20 pb-2 uppercase font-bold text-[10px] tracking-widest">Active_Stream</span>
                    <div className="flex flex-col gap-1.5">
                      {simMode ? (
                        <>
                          <div className={cn("flex justify-between", scenario === 'HIGH_TRAFFIC' && "text-emerald-400 font-bold")}>
                            <span>{">"} CH_1:</span> <span>{scenario === 'HIGH_TRAFFIC' ? '100.0' : scenario === 'SENSOR_ANOMALY' ? '80.0' : '40.0'} M</span>
                          </div>
                          <div className={cn("flex justify-between", scenario === 'HIGH_TRAFFIC' && "text-emerald-400 font-bold")}>
                            <span>{">"} CH_2:</span> <span>{scenario === 'HIGH_TRAFFIC' ? '100.0' : scenario === 'SENSOR_ANOMALY' ? '80.0' : '40.0'} M</span>
                          </div>
                          <div className={cn("flex justify-between", scenario === 'SENSOR_ANOMALY' ? "text-red-500 font-bold animate-pulse" : "text-emerald-400")}>
                            <span>{">"} CH_3:</span> <span>{scenario === 'HIGH_TRAFFIC' ? '100.0' : scenario === 'SENSOR_ANOMALY' ? '5.2' : '40.0'} M</span>
                          </div>
                          <div className={cn("flex justify-between", scenario === 'HIGH_TRAFFIC' && "text-emerald-400 font-bold")}>
                            <span>{">"} CH_4:</span> <span>{scenario === 'HIGH_TRAFFIC' ? '100.0' : scenario === 'SENSOR_ANOMALY' ? '80.0' : '40.0'} M</span>
                          </div>
                        </>
                      ) : (
                        <div className="text-white/20 italic mt-8 text-center text-[10px]">STANDBY_MODE</div>
                      )}
                    </div>
                  </div>
               </div>
            </div>

            {/* Bottom Status */}
            <div className="mt-3 h-10 flex items-center justify-between bg-emerald-500/20 rounded px-4 border-2 border-emerald-500/40 relative z-10">
               <div className="flex gap-6">
                 <div className="flex items-center gap-2">
                   <span className="text-[9px] font-mono text-white/50 uppercase font-bold">STATUS</span>
                   <span className={cn("text-[11px] font-mono font-bold", simMode ? "text-emerald-400" : "text-white/30")}>
                     {simMode ? 'SYSTEM_STREAMING' : 'OFFLINE'}
                   </span>
                 </div>
               </div>
               <div className="text-white/40 text-[9px] font-mono font-bold uppercase tracking-tighter">Peak: 400 Mbps</div>
            </div>
          </div>
        </Html>
      </mesh>
    </group>
  );
}

// --- Main Scene ---

interface SceneProps {
  onComponentClick: (comp: ComponentInfo) => void;
  simulationActive: boolean;
  scenario: SimulationScenario;
  throughput: number;
}

export function PCBScene({ onComponentClick, simulationActive, scenario, throughput }: SceneProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleICClick = (id: string) => {
    const comp = PCB_COMPONENTS.find(c => c.id === id);
    if (comp) onComponentClick(comp);
  };

  const scenarioConfig = SCENARIOS.find(s => s.id === scenario)!;

  return (
    <>
      <PerspectiveCamera makeDefault position={[5, 4, 5]} fov={40} />
      <OrbitControls 
        maxPolarAngle={Math.PI / 2.1} 
        minDistance={2} 
        maxDistance={15}
        makeDefault
      />
      
      <Environment preset="city" />
      <ambientLight intensity={0.4} />
      <pointLight position={[10, 10, 10]} intensity={1} castShadow />

      {/* PCB Base */}
      <group rotation={[0, 0, 0]}>
        <mesh receiveShadow castShadow>
          <boxGeometry args={[4, 0.08, 2.5]} />
          <meshStandardMaterial color="#2d0a4e" roughness={0.1} metalness={0.2} />
        </mesh>
        
        {/* Trace details (Simplified) */}
        <mesh position={[0, 0.041, 0]}>
          <planeGeometry args={[3.8, 2.3]} />
          <meshStandardMaterial 
            color="#3a135e" 
            transparent 
            opacity={0.5} 
            wireframe 
          />
        </mesh>

        {/* ICs */}
        {PCB_COMPONENTS.map(comp => (
          <IC 
            key={comp.id} 
            config={comp} 
            onClick={handleICClick}
            hoveredId={hoveredId}
            setHoveredId={setHoveredId}
          />
        ))}

        {/* Input Headers */}
        {[0.6, 0.2, -0.2, -0.6].map((z, idx) => (
          <group key={idx} position={[-1.8, 0.1, z]}>
            <mesh>
              <boxGeometry args={[0.4, 0.2, 0.3]} />
              <meshStandardMaterial color="#111" />
            </mesh>
            <Text position={[0, 0.15, 0]} fontSize={0.08} rotation={[-Math.PI/2, 0, 0]}>
              IN{idx+1}
            </Text>
          </group>
        ))}
      </group>

      {/* Simulation Devices */}
      <SensorModel position={[-5, 0.4, 1.2]} name="LIDAR A" type="lidar" />
      <SensorModel position={[-5, 0.4, 0.4]} name="RADAR Front" type="radar" />
      <SensorModel position={[-5, 0.4, -0.4]} name="LIDAR B" type="lidar" />
      <SensorModel position={[-5, 0.4, -1.2]} name="RADAR Side" type="radar" />

      <MonitorModel 
        position={[6, 1.3, 0]} 
        throughput={throughput} 
        scenario={scenario}
        simMode={simulationActive}
      />

      {/* Data Flows */}
      {simulationActive && FLOW_PATHS.map((path, idx) => {
        // In anomaly mode, Channel 3 is erratic/broken
        if (scenario === 'SENSOR_ANOMALY' && idx === 2) {
           return (
             <group key={idx}>
               {/* Erratic behavior: Only occasional slow packets */}
               {Math.random() > 0.5 && <DataPacket path={path} speed={0.5} />}
             </group>
           );
        }

        return (
          <group key={idx}>
            <DataPacket path={path} speed={scenarioConfig.packetSpeed} />
            {scenarioConfig.packetDensity > 2 && <DataPacket path={path} speed={scenarioConfig.packetSpeed} delay={0.2} />}
            {scenarioConfig.packetDensity > 3 && <DataPacket path={path} speed={scenarioConfig.packetSpeed} delay={0.4} />}
          </group>
        );
      })}

      <ContactShadows 
        position={[0, -0.01, 0]} 
        opacity={0.4} 
        scale={20} 
        blur={2.4} 
        far={4.5} 
      />
    </>
  );
}

// --- Main App ---

export default function App() {
  const [selectedComp, setSelectedComp] = useState<ComponentInfo | null>(null);
  const [simMode, setSimMode] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [currentScenario, setCurrentScenario] = useState<SimulationScenario>('NOMINAL');
  const [logs, setLogs] = useState<string[]>(['SYS_BOOT: OK', 'LINK_NEGOTIATION: READY']);
  const [throughput, setThroughput] = useState(0);

  const scenarioConfig = SCENARIOS.find(s => s.id === currentScenario)!;

  // Real-time log generation & Throughput simulation
  useEffect(() => {
    if (!simMode) {
      setThroughput(0);
      return;
    }

    const interval = setInterval(() => {
      const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      const nominalMsgs = ['DATA_RX: PHY_1', 'CRC_OK: STREAM_92', 'UPLINK_STABLE: 1Gbps', 'SYNC_PULSE: OK'];
      const highTrafficMsgs = ['WARN: BW_UTIL_88%', 'PEAK_LOAD: 400Mbps', 'LATENCY_STABLE: 1.2ms', 'DATA_XFER_OPTIMAL'];
      const anomalyMsgs = ['ERR: LINE_NOISE_PHY_3', 'THROUGHPUT_DROP: CH_3', 'RECOVER_ATTEMPT: 4', 'REROUTE: FAILSAFE_MODE'];

      const msgs = currentScenario === 'NOMINAL' ? nominalMsgs : 
                   currentScenario === 'HIGH_TRAFFIC' ? highTrafficMsgs : anomalyMsgs;
      
      const message = `${timestamp} - ${msgs[Math.floor(Math.random() * msgs.length)]}`;
      
      setLogs(prev => [message, ...prev].slice(0, 5));
      
      // Fluctuating throughput around the scenario average
      const baseValue = scenarioConfig.avgThroughput;
      const noise = (Math.random() - 0.5) * (baseValue * 0.05); // 5% noise
      setThroughput(baseValue + noise);

    }, 800);

    return () => clearInterval(interval);
  }, [simMode, currentScenario, scenarioConfig]);

  return (
    <div className="w-full h-screen bg-[#0a0c10] text-[#e2e8f0] font-sans overflow-hidden flex flex-col relative border-4 border-[#1e2530]">
      {/* --- HEADER --- */}
      <header className="h-16 border-b border-white/10 bg-black/40 backdrop-blur-md flex items-center justify-between px-8 z-20 shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
          <h1 className="text-xs font-mono tracking-[0.3em] uppercase text-emerald-400">Gateway-V2 Architecture Visualizer</h1>
        </div>
        <div className="flex gap-6 items-center">
          <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded text-[10px] font-mono text-emerald-400">
            SYS_STATUS: {simMode ? 'SIMULATING' : 'IDLE'}
          </div>
          <div className="text-[10px] font-mono opacity-50 uppercase hidden md:block">Module 02 // 2026.f.1</div>
          <button 
             onClick={() => setShowIntro(true)}
             className="text-[10px] font-mono opacity-50 uppercase hover:opacity-100 transition-opacity underline decoration-emerald-500/30"
          >
            System Info
          </button>
        </div>
      </header>

      <main className="flex-1 flex overflow-hidden relative">
        {/* --- LEFT SIDEBAR (Inputs & Controls) --- */}
        <aside className="w-64 border-r border-white/5 bg-black/20 p-6 flex flex-col gap-8 z-10 hidden xl:flex">
          <section>
            <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Input Modules</h3>
            <div className="space-y-3">
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-emerald-500/20 flex items-center justify-center border border-emerald-500/40">
                  <Radio className="w-4 h-4 text-emerald-400" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white uppercase tracking-tighter">LIDAR Array (x2)</div>
                  <div className="text-[9px] text-emerald-500/70 font-mono uppercase text-white/40 tracking-widest leading-none">Input @ 100 Mbps (Max)</div>
                </div>
              </div>
              <div className="p-3 bg-white/5 border border-white/10 rounded-lg flex items-center gap-3">
                <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center border border-purple-500/40 transition-colors">
                  <Activity className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-xs">
                  <div className="font-bold text-white uppercase tracking-tighter">RADAR Scan (x2)</div>
                  <div className="text-[9px] text-purple-500/70 font-mono text-white/40 uppercase tracking-widest leading-none">Input @ 100 Mbps (Max)</div>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-auto space-y-6">
            <section>
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Select Scenario</h3>
              <div className="space-y-2">
                {SCENARIOS.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setCurrentScenario(s.id)}
                    className={cn(
                      "w-full p-2.5 text-[10px] text-left uppercase font-mono border rounded-lg transition-all",
                      currentScenario === s.id
                        ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                        : "bg-white/5 border-white/5 text-white/40 hover:bg-white/10"
                    )}
                  >
                    {s.name}
                  </button>
                ))}
              </div>
            </section>

            <section>
              <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Simulation Engine</h3>
              <div className="grid grid-cols-1 gap-2">
                <button 
                  onClick={() => setSimMode(!simMode)}
                  className={cn(
                    "p-3 text-[10px] uppercase font-bold rounded-lg border transition-all flex items-center justify-center gap-2",
                    simMode 
                      ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.1)]" 
                      : "bg-emerald-500/20 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.1)]"
                  )}
                >
                  {simMode ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {simMode ? 'Terminate' : 'Initialize'}
                </button>
              </div>
            </section>
          </section>
        </aside>

        {/* --- MAIN 3D AREA --- */}
        <div className="flex-1 bg-[radial-gradient(circle_at_50%_50%,_#11141d_0%,_#050608_100%)] relative flex items-center justify-center">
          {/* Grid Background Overlay */}
          <div className="absolute inset-0 opacity-10 technical-grid pointer-events-none"></div>
          
          <Canvas shadows dpr={[1, 2]}>
            <PCBScene 
              simulationActive={simMode} 
              scenario={currentScenario}
              onComponentClick={setSelectedComp} 
              throughput={throughput}
            />
          </Canvas>

          {/* Navigation Controls Tooltip */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-8 bg-black/80 backdrop-blur-xl px-8 py-3 rounded-full border border-white/10 pointer-events-none z-10 shadow-2xl">
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-mono text-white/50 uppercase tracking-[0.2em]">L-Click: Orbit</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_#10b981]"></div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-mono text-white/50 uppercase tracking-[0.2em]">Scroll: Zoom</span>
              <div className="w-1.5 h-1.5 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]"></div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[9px] font-mono text-white/50 uppercase tracking-[0.2em]">R-Click: Pan</span>
              <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_8px_#fff]"></div>
            </div>
          </div>

          {/* Live Data Display (Bottom Right Overlay) */}
          {simMode && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="absolute bottom-8 right-8 w-56 bg-[#0a0c10]/90 backdrop-blur-lg border border-white/20 rounded-sm p-3 flex flex-col gap-2 shadow-2xl z-30"
             >
               <div className="text-[8px] font-mono text-white/50 border-b border-white/10 pb-1 flex justify-between uppercase tracking-tighter">
                 <span>Telemetry_Buffer</span>
                 <span className="text-emerald-400 font-bold">● LIVE_FEED</span>
               </div>
               <div className="flex-1 bg-black/40 rounded flex flex-col border border-white/5 p-2 space-y-1 overflow-hidden">
                 <div className="flex justify-between items-end h-10 gap-[2px]">
                   {[40, 80, 60, 95, 75, 90, 50, 65, 85, 45].map((h, i) => {
                     // Add noise to height based on scenario
                     const heightMultiplier = currentScenario === 'HIGH_TRAFFIC' ? 1.2 : currentScenario === 'SENSOR_ANOMALY' ? 0.6 : 1;
                     const finalH = Math.min(100, h * heightMultiplier);
                     
                     return (
                       <motion.div 
                         key={i} 
                         initial={{ height: 0 }}
                         animate={{ height: `${finalH}%` }}
                         transition={{ repeat: Infinity, duration: 1.5, repeatType: "reverse", delay: i * 0.1 }}
                         className={cn(
                           "w-1 rounded-t-sm",
                           currentScenario === 'SENSOR_ANOMALY' && i % 3 === 0 ? "bg-red-500" : "bg-emerald-500/80 shadow-[0_0_5px_rgba(16,185,129,0.3)]"
                         )} 
                       />
                     );
                   })}
                 </div>
                 <div className="text-[7px] font-mono leading-tight uppercase h-10 overflow-hidden flex flex-col gap-0.5">
                    {logs.map((log, idx) => (
                      <motion.div 
                        key={log + idx} // Combining to avoid keys issues on same message
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        className={cn(
                          idx === 0 ? "text-white" : "text-white/20",
                          log.includes('ERR') || log.includes('WARN') ? "text-red-400" : ""
                        )}
                      >
                        {log}
                      </motion.div>
                    ))}
                 </div>
               </div>
             </motion.div>
          )}
        </div>

        {/* --- RIGHT PANEL (Details) --- */}
        <AnimatePresence>
          {selectedComp && (
            <motion.aside 
              initial={{ x: 400, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 400, opacity: 0 }}
              className="w-72 border-l border-white/5 bg-black/20 p-6 z-10 flex flex-col relative overflow-y-auto shrink-0"
            >
               <h3 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">Component Registry</h3>
               
               <div className="flex-1 bg-white/5 rounded-lg border border-white/10 p-5 space-y-6 flex flex-col shadow-inner">
                 <div className="absolute top-2 right-6">
                    <button 
                      onClick={() => setSelectedComp(null)}
                      className="text-white/20 hover:text-white transition-colors"
                    >
                      <Maximize2 className="w-4 h-4 rotate-45" />
                    </button>
                 </div>

                 <div>
                   <div className="text-[9px] text-emerald-400 uppercase font-mono font-bold tracking-tighter flex items-center gap-1 mb-1">
                     <span className="w-1 h-1 bg-emerald-400 rounded-full animate-ping"></span>
                     ID: {selectedComp.id.toUpperCase()}
                   </div>
                   <div className="text-xl font-bold text-white leading-tight">{selectedComp.name}</div>
                 </div>

                 <div className="space-y-5">
                   <div className="space-y-1.5 text-[10px]">
                     <div className="flex justify-between text-white/40 font-mono uppercase tracking-widest"><span>Load Factor</span><span className="text-white font-bold">82.4%</span></div>
                     <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                       <motion.div initial={{ width: 0 }} animate={{ width: '82.4%' }} className="h-full bg-emerald-400 shadow-[0_0_8px_#10b981]"></motion.div>
                     </div>
                   </div>
                   <div className="space-y-1.5 text-[10px]">
                     <div className="flex justify-between text-white/40 font-mono uppercase tracking-widest"><span>Operating Temp</span><span className="text-white font-bold">42°C</span></div>
                     <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                       <motion.div initial={{ width: 0 }} animate={{ width: '42%' }} className="h-full bg-purple-500 shadow-[0_0_8px_#a855f7]"></motion.div>
                     </div>
                   </div>
                 </div>

                 <div className="pt-5 border-t border-white/10">
                   <div className="text-[9px] uppercase font-bold text-white/40 mb-3 tracking-[0.2em] flex items-center gap-2">
                     <div className="w-4 h-[1px] bg-emerald-500/50"></div>
                     Logic Description
                   </div>
                   <p className="text-[11px] leading-relaxed text-white/70 font-sans tracking-tight">
                     {selectedComp.description}
                   </p>
                 </div>

                 <div className="space-y-2 pt-4">
                    {selectedComp.details.map((d, i) => (
                      <div key={i} className="text-[9px] font-mono text-emerald-400/60 flex items-center gap-2 bg-emerald-500/5 p-2 rounded border border-emerald-500/10">
                        <ChevronRight className="w-2.5 h-2.5 text-emerald-400" />
                        <span className="uppercase tracking-tighter">{d}</span>
                      </div>
                    ))}
                 </div>
               </div>

               <div className="mt-4 p-3 border border-yellow-500/20 bg-yellow-500/5 rounded text-[10px] text-yellow-500/80 italic leading-snug">
                 Note: Ensure impedance control on differential pairs connects within 0.1mm tolerance.
               </div>
            </motion.aside>
          )}
        </AnimatePresence>
      </main>

      {/* --- FOOTER --- */}
      <footer className="h-10 bg-black/80 border-t border-white/10 flex items-center px-8 text-[9px] font-mono justify-between z-20 shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.5)]">
        <div className="flex gap-10">
          <div className="flex items-center gap-3">
            <span className="text-white/30 uppercase tracking-widest text-[8px]">Processor Load</span>
            <span className={cn("font-bold tabular-nums", currentScenario === 'HIGH_TRAFFIC' ? "text-red-500" : "text-emerald-400")}>{scenarioConfig.cpuLoad}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-white/30 uppercase tracking-widest text-[8px]">Aggregate Output (Max 400M)</span>
            <span className="text-emerald-400 font-bold tabular-nums">{throughput.toFixed(1)} Mbps</span>
          </div>
          <div className="flex items-center gap-3 border-l border-white/5 pl-10 h-6">
            <span className="text-white/30 uppercase tracking-widest text-[8px]">Link Status</span>
            <span className={cn("font-bold", currentScenario === 'SENSOR_ANOMALY' ? "text-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" : "text-white")}>{currentScenario === 'SENSOR_ANOMALY' ? 'DEGRADED_MODE' : 'GIGABIT_UP'}</span>
          </div>
        </div>
        <div className="flex gap-6 opacity-40 uppercase tracking-[0.3em] text-white/40 text-[7px]">
          <span>Protocol v4.2.0</span>
          <span>Buffer: A_G_G_0_1</span>
        </div>
      </footer>

      {/* Intro Overlay */}
      <AnimatePresence>
        {showIntro && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-6"
          >
            <motion.div 
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="max-w-xl bg-[#0c1212] border border-white/10 rounded-2xl p-10 shadow-2xl relative overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500 via-white to-purple-500" />
              
              <div className="flex flex-col items-center text-center mb-10">
                <div className="w-16 h-16 border-2 border-emerald-400/40 rounded flex items-center justify-center mb-6 bg-emerald-400/5 shadow-[0_0_20px_rgba(16,185,129,0.1)]">
                  <div className="w-10 h-10 border border-emerald-400 animate-pulse"></div>
                </div>
                <h2 className="text-xs font-mono tracking-[0.4em] text-emerald-400 uppercase mb-4 font-bold">Automotive Sensor Gateway</h2>
                <h3 className="text-2xl font-bold text-white mb-4 tracking-tighter text-balance uppercase">NXP SJA1105 Implementation</h3>
                <p className="text-[#94a3b8] text-sm leading-relaxed max-w-sm">
                  Educational visualizer for a high-performance ADAS gateway. Simulating data aggregation from four 100 Mbps RMII sensor channels into a deterministic 1 Gbps RGMII backbone.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                  <div className="text-[9px] font-mono text-emerald-400 mb-2 uppercase font-bold tracking-widest border-b border-emerald-500/20 pb-1">Input Layer</div>
                  <div className="text-xs font-bold text-white uppercase tracking-tighter leading-tight font-mono">4x 100 Mbps RMII Channels</div>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                  <div className="text-[9px] font-mono text-purple-400 mb-2 uppercase font-bold tracking-widest border-b border-purple-500/20 pb-1">Uplink Layer</div>
                  <div className="text-xs font-bold text-white uppercase tracking-tighter leading-tight font-mono">1.0 Gbps RGMII Link</div>
                </div>
              </div>

              <button 
                onClick={() => setShowIntro(false)}
                className="w-full bg-emerald-500 text-black font-bold py-4 rounded-lg hover:bg-emerald-400 transition-all uppercase text-[10px] tracking-[0.2em] shadow-[0_0_20px_rgba(16,185,129,0.3)] flex items-center justify-center gap-2 group"
              >
                Access Architecture
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
