"""
CBT N-Body Simulation with 10,000 Particles
============================================
Uses Barnes-Hut tree algorithm for O(N log N) performance.
Compares Newton-only vs Newton + CBT binding.

Author: David Dudas
"""

import numpy as np
from dataclasses import dataclass
from typing import Tuple, List
import time

# =============================================================================
# CONSTANTS FROM CBT THEORY
# =============================================================================

E = np.e
PI = np.pi

# Derived CBT parameters
ALPHA_0 = 1.0 / E          # Base coupling
S_COEFF = 1.0 / E          # Scaling coefficient  
R0_SCALE = 10.0            # Reference scale (kpc)
BETA = 2 * E               # Lensing coupling

# Simulation units
G_SIM = 1.0                # Gravitational constant in simulation units


# =============================================================================
# CBT PHYSICS FUNCTIONS
# =============================================================================

def get_alpha(R_kpc: float) -> float:
    """Scale-dependent binding strength from Eq. 3"""
    if R_kpc <= 0:
        return 0.0
    val = ALPHA_0 * (1.0 + S_COEFF * np.log10(R_kpc / R0_SCALE))
    return np.clip(val, 0.0, 1.0)


def get_threshold_radius(R_kpc: float) -> float:
    """Threshold radius from Eq. 4"""
    return R_kpc / (2 * PI) + np.sqrt(2) * E


def get_cbt_binding_acceleration(r: float, R_cluster: float, V_max: float) -> float:
    """
    CBT binding acceleration magnitude.
    
    Args:
        r: Distance from cluster center
        R_cluster: Characteristic cluster size
        V_max: Maximum circular velocity
    
    Returns:
        Binding acceleration magnitude (toward center)
    """
    if r <= 0:
        return 0.0
    
    alpha = get_alpha(R_cluster)
    r_th = get_threshold_radius(R_cluster)
    
    # Binding velocity scales with position
    scale_factor = min(r / r_th, 1.0)
    v0 = alpha * V_max * scale_factor
    
    # Centripetal acceleration from binding
    a_bind = v0**2 / r
    return a_bind


# =============================================================================
# BARNES-HUT TREE
# =============================================================================

@dataclass
class Node:
    """Barnes-Hut tree node"""
    center: np.ndarray      # Center of node region
    size: float             # Half-width of node
    mass: float = 0.0       # Total mass in node
    com: np.ndarray = None  # Center of mass
    children: list = None   # 4 children for 2D (8 for 3D)
    particle_idx: int = -1  # Index if leaf node with single particle
    
    def is_leaf(self) -> bool:
        return self.children is None
    
    def is_empty(self) -> bool:
        return self.mass == 0.0


class BarnesHutTree:
    """2D Barnes-Hut tree for O(N log N) gravity calculation"""
    
    def __init__(self, positions: np.ndarray, masses: np.ndarray, theta: float = 0.7):
        """
        Args:
            positions: (N, 2) array of particle positions
            masses: (N,) array of particle masses
            theta: Opening angle parameter (smaller = more accurate, slower)
        """
        self.positions = positions
        self.masses = masses
        self.theta = theta
        self.softening = 0.1
        
        # Build tree
        self.root = self._build_tree()
    
    def _build_tree(self) -> Node:
        """Build the Barnes-Hut tree"""
        # Find bounding box
        min_pos = np.min(self.positions, axis=0)
        max_pos = np.max(self.positions, axis=0)
        center = (min_pos + max_pos) / 2
        size = np.max(max_pos - min_pos) / 2 * 1.01  # Slight padding
        
        root = Node(center=center, size=size, com=np.zeros(2))
        
        # Insert all particles
        for i in range(len(self.masses)):
            self._insert(root, i)
        
        return root
    
    def _insert(self, node: Node, idx: int):
        """Insert particle into tree"""
        pos = self.positions[idx]
        mass = self.masses[idx]
        
        if node.is_empty():
            # Empty node: just add particle
            node.mass = mass
            node.com = pos.copy()
            node.particle_idx = idx
            return
        
        if node.is_leaf():
            # Leaf with one particle: subdivide
            old_idx = node.particle_idx
            node.particle_idx = -1
            self._subdivide(node)
            self._insert(node, old_idx)
        
        # Internal node: update mass and COM, then recurse
        new_mass = node.mass + mass
        node.com = (node.com * node.mass + pos * mass) / new_mass
        node.mass = new_mass
        
        # Find correct child
        child_idx = self._get_child_index(node, pos)
        self._insert(node.children[child_idx], idx)
    
    def _subdivide(self, node: Node):
        """Create 4 children for 2D"""
        node.children = []
        half_size = node.size / 2
        
        for i in range(4):
            # Quadrant offsets
            dx = half_size if (i & 1) else -half_size
            dy = half_size if (i & 2) else -half_size
            
            child_center = node.center + np.array([dx, dy])
            child = Node(center=child_center, size=half_size, com=np.zeros(2))
            node.children.append(child)
    
    def _get_child_index(self, node: Node, pos: np.ndarray) -> int:
        """Get index of child containing position"""
        idx = 0
        if pos[0] > node.center[0]:
            idx |= 1
        if pos[1] > node.center[1]:
            idx |= 2
        return idx
    
    def compute_acceleration(self, pos: np.ndarray) -> np.ndarray:
        """Compute gravitational acceleration at position using tree"""
        return self._compute_acc_recursive(self.root, pos)
    
    def _compute_acc_recursive(self, node: Node, pos: np.ndarray) -> np.ndarray:
        """Recursive acceleration calculation"""
        if node.is_empty():
            return np.zeros(2)
        
        r_vec = node.com - pos
        r = np.linalg.norm(r_vec)
        
        if r < self.softening:
            return np.zeros(2)
        
        # Check opening criterion
        if node.is_leaf() or (node.size / r < self.theta):
            # Use monopole approximation
            acc_mag = G_SIM * node.mass / (r**2 + self.softening**2)
            return acc_mag * r_vec / r
        
        # Recurse into children
        acc = np.zeros(2)
        for child in node.children:
            acc += self._compute_acc_recursive(child, pos)
        return acc


# =============================================================================
# SIMULATION
# =============================================================================

def initialize_cluster(n_particles: int, radius: float, seed: int = 42) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Initialize a virialized cluster.
    
    Returns:
        positions, velocities, masses
    """
    np.random.seed(seed)
    
    # Plummer sphere distribution for positions
    # r = a / sqrt(u^(-2/3) - 1) where u is uniform
    a = radius / 2  # Scale radius
    u = np.random.uniform(0.01, 1.0, n_particles)
    r = a / np.sqrt(u**(-2/3) - 1)
    r = np.clip(r, 0, radius * 3)  # Clip outliers
    
    theta = np.random.uniform(0, 2 * np.pi, n_particles)
    
    positions = np.zeros((n_particles, 2))
    positions[:, 0] = r * np.cos(theta)
    positions[:, 1] = r * np.sin(theta)
    
    # Equal masses
    masses = np.ones(n_particles)
    
    # Circular velocities for virial equilibrium
    total_mass = np.sum(masses)
    velocities = np.zeros((n_particles, 2))
    
    for i in range(n_particles):
        ri = np.linalg.norm(positions[i])
        if ri > 0.1:
            # Enclosed mass approximation
            m_enc = total_mass * (ri / radius)**2  # Simplified
            v_circ = np.sqrt(G_SIM * m_enc / ri)
            
            # Tangential velocity
            theta_i = np.arctan2(positions[i, 1], positions[i, 0])
            velocities[i, 0] = -v_circ * np.sin(theta_i) * 0.7  # Slightly sub-virial
            velocities[i, 1] = v_circ * np.cos(theta_i) * 0.7
    
    return positions, velocities, masses


def run_simulation(
    n_particles: int = 10000,
    n_steps: int = 500,
    dt: float = 0.01,
    cluster_radius: float = 10.0,
    use_cbt: bool = False,
    verbose: bool = True
) -> Tuple[List[float], List[float], np.ndarray]:
    """
    Run N-body simulation.
    
    Args:
        n_particles: Number of particles
        n_steps: Number of time steps
        dt: Time step size
        cluster_radius: Initial cluster radius
        use_cbt: Whether to include CBT binding force
        verbose: Print progress
    
    Returns:
        dispersion_history, time_history, final_positions
    """
    # Initialize
    positions, velocities, masses = initialize_cluster(n_particles, cluster_radius)
    
    dispersion_history = []
    time_history = []
    
    if verbose:
        mode = "CBT" if use_cbt else "Newton"
        print(f"\n{'='*60}")
        print(f"Running {mode} simulation with {n_particles} particles")
        print(f"{'='*60}")
    
    start_time = time.time()
    
    for step in range(n_steps):
        # Compute cluster properties for CBT
        center_of_mass = np.average(positions, axis=0, weights=masses)
        R_cluster = np.sqrt(np.mean(np.sum((positions - center_of_mass)**2, axis=1)))
        V_max = np.sqrt(G_SIM * np.sum(masses) / R_cluster)
        
        # Build tree for this timestep
        tree = BarnesHutTree(positions, masses, theta=0.7)
        
        # Compute accelerations
        accelerations = np.zeros((n_particles, 2))
        
        for i in range(n_particles):
            # Gravitational acceleration from tree
            acc_grav = tree.compute_acceleration(positions[i])
            accelerations[i] = acc_grav
            
            # Add CBT binding if enabled
            if use_cbt:
                r_vec = center_of_mass - positions[i]
                r = np.linalg.norm(r_vec)
                if r > 0.1:
                    a_bind = get_cbt_binding_acceleration(r, R_cluster, V_max)
                    accelerations[i] += a_bind * (r_vec / r)
        
        # Leapfrog integration
        velocities += accelerations * dt
        positions += velocities * dt
        
        # Record dispersion
        dispersion = np.std(positions)
        dispersion_history.append(dispersion)
        time_history.append(step * dt)
        
        # Progress
        if verbose and step % 50 == 0:
            elapsed = time.time() - start_time
            print(f"Step {step:4d}/{n_steps} | σ = {dispersion:.4f} | Time: {elapsed:.1f}s")
    
    if verbose:
        total_time = time.time() - start_time
        print(f"\nCompleted in {total_time:.1f} seconds")
        print(f"Final dispersion: {dispersion_history[-1]:.4f}")
    
    return dispersion_history, time_history, positions


def main():
    """Run comparison simulation"""
    print("="*70)
    print("CBT N-BODY SIMULATION: 10,000 PARTICLES")
    print("Comparing Newton-only vs Newton + CBT Binding")
    print("="*70)
    
    N = 10000
    STEPS = 300
    DT = 0.005
    
    # Run Newton-only
    print("\n[1/2] Running Newton-only simulation...")
    disp_newton, times, pos_newton = run_simulation(
        n_particles=N, n_steps=STEPS, dt=DT, use_cbt=False
    )
    
    # Run with CBT
    print("\n[2/2] Running Newton + CBT simulation...")
    disp_cbt, _, pos_cbt = run_simulation(
        n_particles=N, n_steps=STEPS, dt=DT, use_cbt=True
    )
    
    # Results
    print("\n" + "="*70)
    print("RESULTS")
    print("="*70)
    
    final_newton = disp_newton[-1]
    final_cbt = disp_cbt[-1]
    initial = disp_newton[0]
    
    expansion_newton = final_newton / initial
    expansion_cbt = final_cbt / initial
    binding_effect = (final_newton - final_cbt) / final_newton * 100
    
    print(f"\nInitial dispersion:     {initial:.4f}")
    print(f"\nNewton final:           {final_newton:.4f} ({expansion_newton:.2f}x expansion)")
    print(f"CBT final:              {final_cbt:.4f} ({expansion_cbt:.2f}x expansion)")
    print(f"\nBinding effect:         {binding_effect:.1f}% reduction in dispersion")
    
    if binding_effect > 10:
        print("\n*** SIGNIFICANT BINDING DETECTED ***")
    
    # Save data for plotting
    np.savez('nbody_results.npz',
             times=times,
             disp_newton=disp_newton,
             disp_cbt=disp_cbt,
             pos_newton=pos_newton,
             pos_cbt=pos_cbt)
    print("\nResults saved to nbody_results.npz")
    
    # Generate plot
    try:
        import matplotlib.pyplot as plt
        
        fig, axes = plt.subplots(1, 3, figsize=(15, 5))
        
        # Plot 1: Dispersion over time
        ax1 = axes[0]
        ax1.plot(times, disp_newton, 'r-', label='Newton only', linewidth=2)
        ax1.plot(times, disp_cbt, 'b-', label='Newton + CBT', linewidth=2)
        ax1.set_xlabel('Time', fontsize=12)
        ax1.set_ylabel('Dispersion σ', fontsize=12)
        ax1.set_title('Cluster Dispersion Evolution', fontsize=14)
        ax1.legend(fontsize=11)
        ax1.grid(True, alpha=0.3)
        
        # Plot 2: Final Newton positions
        ax2 = axes[1]
        ax2.scatter(pos_newton[:, 0], pos_newton[:, 1], s=0.5, alpha=0.5, c='red')
        ax2.set_xlabel('x', fontsize=12)
        ax2.set_ylabel('y', fontsize=12)
        ax2.set_title(f'Newton Only (σ={final_newton:.2f})', fontsize=14)
        ax2.set_aspect('equal')
        ax2.set_xlim(-50, 50)
        ax2.set_ylim(-50, 50)
        
        # Plot 3: Final CBT positions
        ax3 = axes[2]
        ax3.scatter(pos_cbt[:, 0], pos_cbt[:, 1], s=0.5, alpha=0.5, c='blue')
        ax3.set_xlabel('x', fontsize=12)
        ax3.set_ylabel('y', fontsize=12)
        ax3.set_title(f'Newton + CBT (σ={final_cbt:.2f})', fontsize=14)
        ax3.set_aspect('equal')
        ax3.set_xlim(-50, 50)
        ax3.set_ylim(-50, 50)
        
        plt.tight_layout()
        plt.savefig('nbody_comparison.png', dpi=150, bbox_inches='tight')
        print("Plot saved to nbody_comparison.png")
        plt.show()
        
    except ImportError:
        print("matplotlib not available, skipping plot")


if __name__ == "__main__":
    main()
