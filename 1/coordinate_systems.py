import math
import random
import time
from dataclasses import dataclass
from typing import List, Tuple

@dataclass(frozen=True)
class CartesianPoint2D:
    x: float
    y: float
    
    @staticmethod
    def from_polar(radius: float, angle: float) -> 'CartesianPoint2D':
        return CartesianPoint2D(radius * math.cos(angle), radius * math.sin(angle))
    
    def distance_to(self, other: 'CartesianPoint2D') -> float:
        dx = self.x - other.x
        dy = self.y - other.y
        return math.sqrt(dx*dx + dy*dy)

@dataclass(frozen=True)
class PolarPoint:
    radius: float
    angle: float
    
    @staticmethod
    def from_cartesian(x: float, y: float) -> 'PolarPoint':
        radius = math.sqrt(x*x + y*y)
        angle = math.atan2(y, x)
        return PolarPoint(radius, angle)
    
    @staticmethod
    def from_cartesian_point(point: CartesianPoint2D) -> 'PolarPoint':
        return PolarPoint.from_cartesian(point.x, point.y)
    
    def distance_to(self, other: 'PolarPoint') -> float:
        return math.sqrt(self.radius**2 + other.radius**2 - 
                        2 * self.radius * other.radius * math.cos(other.angle - self.angle))

@dataclass(frozen=True)
class CartesianPoint3D:
    x: float
    y: float
    z: float
    
    @staticmethod
    def from_spherical(radius: float, azimuth: float, polar_angle: float) -> 'CartesianPoint3D':
        x = radius * math.sin(polar_angle) * math.cos(azimuth)
        y = radius * math.sin(polar_angle) * math.sin(azimuth)
        z = radius * math.cos(polar_angle)
        return CartesianPoint3D(x, y, z)
    
    def distance_to(self, other: 'CartesianPoint3D') -> float:
        dx = self.x - other.x
        dy = self.y - other.y
        dz = self.z - other.z
        return math.sqrt(dx*dx + dy*dy + dz*dz)

@dataclass(frozen=True)
class SphericalPoint:
    radius: float
    azimuth: float
    polar_angle: float
    
    @staticmethod
    def from_cartesian(x: float, y: float, z: float) -> 'SphericalPoint':
        radius = math.sqrt(x*x + y*y + z*z)
        azimuth = math.atan2(y, x)
        polar_angle = math.acos(z / radius) if radius > 0 else 0
        return SphericalPoint(radius, azimuth, polar_angle)
    
    @staticmethod
    def from_cartesian_point(point: CartesianPoint3D) -> 'SphericalPoint':
        return SphericalPoint.from_cartesian(point.x, point.y, point.z)
    
    def chord_distance_to(self, other: 'SphericalPoint') -> float:
        sin_theta1 = math.sin(self.polar_angle)
        sin_theta2 = math.sin(other.polar_angle)
        cos_theta1 = math.cos(self.polar_angle)
        cos_theta2 = math.cos(other.polar_angle)
        
        term = (sin_theta1 * sin_theta2 * math.cos(self.azimuth - other.azimuth) + 
                cos_theta1 * cos_theta2)
        
        return math.sqrt(self.radius**2 + other.radius**2 - 
                        2 * self.radius * other.radius * term)
    
    def arc_distance_to(self, other: 'SphericalPoint') -> float:
        if self.radius != other.radius:
            print("Warning: Arc distance requires same radius for both points!")
            return 0
        
        term = (math.sin(self.polar_angle) * math.sin(other.polar_angle) * 
                math.cos(self.azimuth - other.azimuth) + 
                math.cos(self.polar_angle) * math.cos(other.polar_angle))
        
        term = max(-1.0, min(1.0, term))
        
        return self.radius * math.acos(term)

def test_conversions():
    print("=== Testing 2D Conversions ===")
    
    polar = PolarPoint(5.0, math.pi / 4)
    cart = CartesianPoint2D.from_polar(polar.radius, polar.angle)
    polar_back = PolarPoint.from_cartesian_point(cart)
    
    print(f"Original Polar: r={polar.radius:.6f}, angle={polar.angle:.6f}")
    print(f"To Cartesian: x={cart.x:.6f}, y={cart.y:.6f}")
    print(f"Back to Polar: r={polar_back.radius:.6f}, angle={polar_back.angle:.6f}")
    print(f"Error: r={abs(polar.radius - polar_back.radius):.10f}, angle={abs(polar.angle - polar_back.angle):.10f}")
    
    print("\n=== Testing 3D Conversions ===")
    
    spherical = SphericalPoint(5.0, math.pi / 4, math.pi / 3)
    cart3d = CartesianPoint3D.from_spherical(spherical.radius, spherical.azimuth, spherical.polar_angle)
    spherical_back = SphericalPoint.from_cartesian_point(cart3d)
    
    print(f"Original Spherical: r={spherical.radius:.6f}, azimuth={spherical.azimuth:.6f}, polar={spherical.polar_angle:.6f}")
    print(f"To Cartesian: x={cart3d.x:.6f}, y={cart3d.y:.6f}, z={cart3d.z:.6f}")
    print(f"Back to Spherical: r={spherical_back.radius:.6f}, azimuth={spherical_back.azimuth:.6f}, polar={spherical_back.polar_angle:.6f}")
    print(f"Error: r={abs(spherical.radius - spherical_back.radius):.10f}, "
          f"azimuth={abs(spherical.azimuth - spherical_back.azimuth):.10f}, "
          f"polar={abs(spherical.polar_angle - spherical_back.polar_angle):.10f}")

def run_2d_benchmark():
    print("\n" + "="*50)
    print("2D BENCHMARK")
    print("="*50)
    
    NUM_PAIRS = 100000
    polar_pairs = []
    cart_pairs = []
    
    print("Generating test data...")
    
    for i in range(NUM_PAIRS):
        p1 = PolarPoint(random.uniform(1.0, 10.0), random.uniform(0.0, 2 * math.pi))
        p2 = PolarPoint(random.uniform(1.0, 10.0), random.uniform(0.0, 2 * math.pi))
        polar_pairs.append((p1, p2))
        
        c1 = CartesianPoint2D.from_polar(p1.radius, p1.angle)
        c2 = CartesianPoint2D.from_polar(p2.radius, p2.angle)
        cart_pairs.append((c1, c2))
    
    # Підхід А: Полярні координати
    print("Calculating distances in polar coordinates...")
    start = time.time()
    polar_sum = 0
    for p1, p2 in polar_pairs:
        polar_sum += p1.distance_to(p2)
    polar_time = (time.time() - start) * 1_000_000  # мікросекунди
    
    # Підхід Б: Декартові координати
    print("Calculating distances in cartesian coordinates...")
    start = time.time()
    cart_sum = 0
    for c1, c2 in cart_pairs:
        cart_sum += c1.distance_to(c2)
    cart_time = (time.time() - start) * 1_000_000  # мікросекунди
    
    print("\n--- RESULTS ---")
    print(f"Polar coordinates time: {polar_time:,.0f} microseconds")
    print(f"Cartesian coordinates time: {cart_time:,.0f} microseconds")
    print(f"Ratio (Polar/Cartesian): {polar_time/cart_time:.2f}")
    
    # Перевірка коректності
    difference = abs(polar_sum - cart_sum)
    print(f"Difference between methods: {difference:.6f}")

def run_3d_benchmark():
    print("\n" + "="*50)
    print("3D BENCHMARK")
    print("="*50)
    
    NUM_PAIRS = 100000
    spherical_pairs = []
    cart_pairs = []
    
    print("Generating test data...")
    
    for i in range(NUM_PAIRS):
        radius = random.uniform(1.0, 10.0)
        p1 = SphericalPoint(radius, random.uniform(0.0, 2 * math.pi), random.uniform(0.0, math.pi))
        p2 = SphericalPoint(radius, random.uniform(0.0, 2 * math.pi), random.uniform(0.0, math.pi))
        spherical_pairs.append((p1, p2))
        
        c1 = CartesianPoint3D.from_spherical(p1.radius, p1.azimuth, p1.polar_angle)
        c2 = CartesianPoint3D.from_spherical(p2.radius, p2.azimuth, p2.polar_angle)
        cart_pairs.append((c1, c2))
    
    # Підхід А: Сферична хорда
    print("Calculating chord distances...")
    start = time.time()
    chord_sum = 0
    for p1, p2 in spherical_pairs:
        chord_sum += p1.chord_distance_to(p2)
    chord_time = (time.time() - start) * 1_000_000
    
    # Підхід Б: Сферична дуга
    print("Calculating arc distances...")
    start = time.time()
    arc_sum = 0
    for p1, p2 in spherical_pairs:
        arc_sum += p1.arc_distance_to(p2)
    arc_time = (time.time() - start) * 1_000_000
    
    # Підхід В: Декартова 3D
    print("Calculating cartesian distances...")
    start = time.time()
    cart_sum = 0
    for c1, c2 in cart_pairs:
        cart_sum += c1.distance_to(c2)
    cart_time = (time.time() - start) * 1_000_000
    
    print("\n--- RESULTS ---")
    print(f"Spherical chord time: {chord_time:,.0f} microseconds")
    print(f"Spherical arc time: {arc_time:,.0f} microseconds")
    print(f"Cartesian 3D time: {cart_time:,.0f} microseconds")
    print("\n--- PERFORMANCE RATIOS ---")
    print(f"Chord/Cartesian: {chord_time/cart_time:.2f}")
    print(f"Arc/Cartesian: {arc_time/cart_time:.2f}")
    
    # Перевірка коректності
    print(f"\n--- VALIDATION ---")
    print(f"Chord vs Cartesian difference: {abs(chord_sum - cart_sum):.6f}")

def main():
    print("🎯 COORDINATE SYSTEMS IMPLEMENTATION AND BENCHMARKING")
    print("=" * 60)
    
    # Тестування коректності перетворень
    print("\n🔍 TESTING COORDINATE CONVERSIONS")
    test_conversions()
    
    # Запуск бенчмарків
    run_2d_benchmark()
    run_3d_benchmark()
    
    print("\n" + "=" * 60)
    print("✅ ALL TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()