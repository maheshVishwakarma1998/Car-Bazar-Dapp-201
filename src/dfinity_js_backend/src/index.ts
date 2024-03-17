import { v4 as uuidv4 } from 'uuid';
import { Server, StableBTreeMap, ic, Opt, Result, Vec } from 'azle';

// Define types for Car and CarPayload
type Car = {
  id: string;
  name: string;
  model: string;
  cubicCapacityOfEngine: string;
  price: number;
  topSpeed: number;
  companyName: string;
  image: string;
  owner: string; // Assuming owner is identified by ID
  createdAt: number;
  updatedAt: number | null;
};

type CarPayload = {
  name: string;
  model: string;
  cubicCapacityOfEngine: string;
  price: number;
  topSpeed: number;
  companyName: string;
  image: string;
};

const carStorage = new StableBTreeMap<string, Car>(0, 44, 1024);

// Function to create a new car
export function createCar(payload: CarPayload, owner: string): Result<Car, string> {
  const id = uuidv4();
  const createdAt = ic.time();
  const car: Car = {
    id,
    createdAt,
    updatedAt: null,
    owner,
    ...payload,
  };
  carStorage.insert(id, car);
  return Result.Ok<Car, string>(car);
}

// Function to get a car by ID
export function getCarById(id: string): Result<Car, string> {
  const car = carStorage.get(id).Some;
  if (car) {
    return Result.Ok<Car, string>(car);
  } else {
    return Result.Err<Car, string>(`Car with id=${id} not found.`);
  }
}

// Function to get a car by name
export function getCarByName(name: string): Result<Car, string> {
  const cars = carStorage.values();
  const foundCar = cars.find((car) => car.name.toLowerCase() === name.toLowerCase());
  if (foundCar) {
    return Result.Ok<Car, string>(foundCar);
  } else {
    return Result.Err<Car, string>(`Car with name="${name}" not found.`);
  }
}

// Function to get all cars
export function getAllCars(): Result<Vec<Car>, string> {
  return Result.Ok(carStorage.values());
}

// Function to update a car
export function updateCar(id: string, payload: CarPayload): Result<Car, string> {
  const existingCar = carStorage.get(id).Some;
  if (existingCar) {
    const updatedAt = ic.time();
    const updatedCar = { ...existingCar, ...payload, updatedAt };
    carStorage.insert(id, updatedCar);
    return Result.Ok<Car, string>(updatedCar);
  } else {
    return Result.Err<Car, string>(`Car with id=${id} not found.`);
  }
}

// Function to delete a car
export function deleteCar(id: string): Result<Car, string> {
  const existingCar = carStorage.get(id).Some;
  if (existingCar) {
    carStorage.remove(id);
    return Result.Ok<Car, string>(existingCar);
  } else {
    return Result.Err<Car, string>(`Car with id=${id} not found.`);
  }
}

// Initialize crypto for UUID generation
globalThis.crypto = {
  //@ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  },
};

// Car Bazaar: A platform to manage and discover cars seamlessly
