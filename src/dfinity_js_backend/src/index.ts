import {
  $query,
  $update,
  Record,
  StableBTreeMap,
  Vec,
  match,
  Result,
  nat64,
  ic,
  Opt,
  Principal,
} from "azle";
import { v4 as uuidv4 } from "uuid";

type Car = Record<{
  id: string;
  name: string;
  model: string;
  cubicCapacityOfEngine: string; 
  price: string; 
  topSpeed: string; 
  companyName: string; 
  image: string;
  owner: Principal;
  createdAt: nat64;
  updatedAt: Opt<nat64>;
}>;

type CarPayload = Record<{
  name: string;
  model: string;
  cubicCapacityOfEngine: string;
  description: string;
  price: string;
  topSpeed: string;
  companyName: string; 
  image: string;
}>;

const carStorage = new StableBTreeMap<string, Car>(0, 44, 1024);

$update;
export function createCar(payload: CarPayload): Result<Car, string> {
  const car: Car = {
    id: uuidv4(),
    createdAt: ic.time(),
    updatedAt: Opt.None,
    ...payload,
    owner: ic.caller(),
  };

  carStorage.insert(car.id, car);
  return Result.Ok<Car, string>(car);
}

$query;
export function getCarById(id: string): Result<Car, string> {
  return match(carStorage.get(id), {
    Some: (car) => Result.Ok<Car, string>(car),
    None: () => Result.Err<Car, string>(`Car with id=${id} not found.`),
  });
}
$query;
export function getCarByName(name: string): Result<Car, string> {
  const cars = carStorage.values();

  const foundCar = cars.find((car) => car.name.toLowerCase() === name.toLowerCase());

  if (foundCar) {
    return Result.Ok<Car, string>(foundCar);
  }

  return Result.Err<Car, string>(`Car with name="${name}" not found.`);
}


$query;
export function getAllCars(): Result<Vec<Car>, string> {
  return Result.Ok(carStorage.values());
}

$update;
export function updateCar(id: string, payload: CarPayload): Result<Car, string> {
  return match(carStorage.get(id), {
    Some: (existingCar) => {
      const updatedCar: Car = {
        ...existingCar,
        ...payload,
        updatedAt: Opt.Some(ic.time()),
      };

      carStorage.insert(updatedCar.id, updatedCar);
      return Result.Ok<Car, string>(updatedCar);
    },
    None: () => Result.Err<Car, string>(`Car with id=${id} not found.`),
  });
}

$update;
export function deleteCar(id: string): Result<Car, string> {
  return match(carStorage.get(id), {
    Some: (existingCar) => {
      carStorage.remove(id);
      return Result.Ok<Car, string>(existingCar);
    },
    None: () => Result.Err<Car, string>(`Car with id=${id} not found.`),
  });
}
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

// Car_Bazar is a dynamic TypeScript web application designed to revolutionize the way you manage and discover cars. Our project empowers users to seamlessly perform CRUD (Create, Read, Update, Delete) operations on cars while providing personalized car recommendations based on user preferences.