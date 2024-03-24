import {
  query,
  update,
  text,
  Record,
  StableBTreeMap,
  Variant,
  Vec,
  None,
  Some,
  Ok,
  Err,
  ic,
  Principal,
  Opt,
  nat64,
  Duration,
  Result,
  bool,
  Canister,
  init,
} from "azle";
import {
  Ledger,
  binaryAddressFromAddress,
  binaryAddressFromPrincipal,
  hexAddressFromPrincipal,
} from "azle/canisters/ledger";
//@ts-ignore
import { hashCode } from "hashcode";
import { v4 as uuidv4 } from "uuid";

const Car = Record({
  id: text,
  name: text,
  imageUrl: text,
  model: text,
  price: nat64,
  cubicCapacityOfEngine: text,
  topSpeed: text,
  companyName: text,
  isReserved: bool,
  isAvailable: bool,
  currentReservedTo: Opt(Principal),
  currentReservationEnds: Opt(nat64),
  creator: Principal,
});

const CarPayload = Record({
  name: text,
  imageUrl: text,
  model: text,
  price: nat64,
  cubicCapacityOfEngine: text,
  topSpeed: text,
  companyName: text,
});

const InitPayload = Record({
  reservationFee: nat64,
});

const ReservationStatus = Variant({
  PaymentPending: text,
  Completed: text,
});

// const CarBooking = Record({
//   carId: text,
//   amount: nat64,
//   noOfPersons: nat64,
//   status: ReservationStatus,
//   payer: Principal,
//   paid_at_block: Opt(nat64),
//   memo: nat64,
// });

const Message = Variant({
  Booked: text,
  NotBooked: text,
  NotFound: text,
  NotOwner: text,
  InvalidPayload: text,
  PaymentFailed: text,
  PaymentCompleted: text,
});

const carStorage = StableBTreeMap(0, text, Car);
// const persistedBookings = StableBTreeMap(1, Principal, Booking);
// const pendingBookings = StableBTreeMap(2, nat64, Booking);

// fee to be charged upon room reservation and refunded after room is left
let reservationFee: Opt<nat64> = None;

const ORDER_RESERVATION_PERIOD = 120n; // reservation period in seconds

/* 
    initialization of the Ledger canister. The principal text value is hardcoded because 
    we set it in the `dfx.json`
*/
const icpCanister = Ledger(Principal.fromText("ryjl3-tyaaa-aaaaa-aaaba-cai"));

export default Canister({
  // set reservation fee
  initData: init([InitPayload], (payload) => {
    reservationFee = Some(payload.reservationFee);
  }),

  // return cars reservation fee
  getCars: query([], Vec(Car), () => {
    return carStorage.values();
  }),

  // return a particular car
  getCar: query([text], Result(Car, Message), (id) => {
    const carOpt = carStorage.get(id);
    if ("None" in carOpt) {
      return Err({ NotFound: `car with id=${id} not found` });
    }
    return Ok(carOpt.Some);
  }),

  // return cars based on price
  getCarByPrice: query([nat64], Result(Vec(Car), Message), (maxPrice) => {
    const filteredCars = carStorage
      .values()
      .filter((car) => car.price <= maxPrice);
    return Ok(filteredCars);
  }),

  // return cars based on model
  getCarByModel: query([text], Result(Vec(Car), Message), (model) => {
    const filteredCars = carStorage
      .values()
      .filter((car) => car.model.toLowerCase() === model.toLowerCase());
    return Ok(filteredCars);
  }),

  // return cars based on companyName
  getCarByCompanyName: query(
    [text],
    Result(Vec(Car), Message),
    (companyName) => {
      const filteredCars = carStorage
        .values()
        .filter(
          (car) => car.companyName.toLowerCase() === companyName.toLowerCase()
        );
      return Ok(filteredCars);
    }
  ),

  // return cars based on topSpeed
  getTopSpeedCar: query([text], Result(Vec(Car), Message), (topSpeed) => {
    const filteredCars = carStorage
      .values()
      .filter((car) => car.topSpeed.toLowerCase() === topSpeed.toLowerCase());
    return Ok(filteredCars);
  }),

  // add new car
  addCar: update([CarPayload], Result(Car, Message), (payload) => {
    if (typeof payload !== "object" || Object.keys(payload).length === 0) {
      return Err({ NotFound: "invalid payoad" });
    }
    const car = {
      id: uuidv4(),
      isReserved: false,
      isAvailable: true,
      currentReservedTo: None,
      currentReservationEnds: None,
      creator: ic.caller(),
      ...payload,
    };
    carStorage.insert(car.id, car);
    return Ok(car);
  }),

  // delete Car
  deleteCar: update([text], Result(text, Message), (id) => {
    // check Car before deleting
    const carOpt = carStorage.get(id);
    if ("None" in carOpt) {
      return Err({
        NotFound: `cannot delete the Car: Car with id=${id} not found`,
      });
    }

    if (carOpt.Some.creator.toString() !== ic.caller().toString()) {
      return Err({ NotOwner: "only creator can delete Car" });
    }

    if (carOpt.Some.isReserved) {
      return Err({
        Booked: `Car with id ${id} is currently booked`,
      });
    }
    const deletedCarOpt = carStorage.remove(id);

    return Ok(deletedCarOpt.Some.id);
  }),

  //   // Add function to sell a car
  sellCar : update([text, Principal], Result(Car, Message),  (id, buyer) => {
    const carOpt = carStorage.get(id);
    if ("None" in carOpt) {
      return Err({ NotFound: `Car with id=${id} not found` });
    }

    const car = carOpt.Some;

    if (!car.isAvailable || car.isReserved) {
      return Err({ NotAvailable: `Car with id=${id} is not available for sale` });
    }

    // Example payment logic
    const paymentResult = await makePayment(buyer, car.price);
    if ("Err" in paymentResult) {
      return Err({ PaymentFailed: `Payment failed: ${paymentResult.Err}` });
    }

    // Update ownership details
    car.isAvailable = false;
    car.isReserved = true;
    car.currentReservedTo = Some(buyer);

    // You may want to implement additional logic here, like updating the reservation end time

    carStorage.insert(id, car);
    return Ok(car);
  }),

  // Add function to purchase a car
  purchaseCar : update([text], Result(Car, Message), async (id) => {
    const carOpt = carStorage.get(id);
    if ("None" in carOpt) {
      return Err({ NotFound: `Car with id=${id} not found` });
    }

    const car = carOpt.Some;

    if (!car.isReserved || !car.currentReservedTo || car.isAvailable) {
      return Err({ NotReserved: `Car with id=${id} is not reserved or already available for purchase` });
    }

    const buyer = ic.caller();

    if (car.currentReservedTo.unwrap().toText() !== buyer.toText()) {
      return Err({ NotOwner: `You are not the reserved owner of the car with id=${id}` });
    }

    // Example payment logic
    const paymentResult = await makePayment(buyer, car.price);
    if ("Err" in paymentResult) {
      return Err({ PaymentFailed: `Payment failed: ${paymentResult.Err}` });
    }

    // Update ownership details
    car.isReserved = false;
    car.isAvailable = false; // Optionally, mark the car as sold
    car.currentReservedTo = None;
    car.currentReservationEnds = None;

    carStorage.insert(id, car);
    return Ok(car);
  }),

  // a helper function to get canister address from the principal
  getCanisterAddress: query([], text, () => {
    let canisterPrincipal = ic.id();
    return hexAddressFromPrincipal(canisterPrincipal, 0);
  }),

  // a helper function to get address from the principal
  getAddressFromPrincipal: query([Principal], text, (principal) => {
    return hexAddressFromPrincipal(principal, 0);
  }),

  // returns the reservation fee
  getReservationFee: query([], nat64, () => {
    if ("None" in reservationFee) {
      return BigInt(0);
    }
    return reservationFee.Some;
  }),
});

/*
    a hash function that is used to generate correlation ids for orders.
    also, we use that in the verifyPayment function where we check if the used has actually paid the order
*/
function hash(input: any): nat64 {
  return BigInt(Math.abs(hashCode().value(input)));
}

// a workaround to make uuid package work with Azle
globalThis.crypto = {
  // @ts-ignore
  getRandomValues: () => {
    let array = new Uint8Array(32);

    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }

    return array;
  },
};

// to process refund of reservation fee to users.
async function makePayment(address: Principal, amount: nat64) {
  const toAddress = hexAddressFromPrincipal(address, 0);
  const transferFeeResponse = await ic.call(icpCanister.transfer_fee, {
    args: [{}],
  });
  const transferResult = ic.call(icpCanister.transfer, {
    args: [
      {
        memo: 0n,
        amount: {
          e8s: amount - transferFeeResponse.transfer_fee.e8s,
        },
        fee: {
          e8s: transferFeeResponse.transfer_fee.e8s,
        },
        from_subaccount: None,
        to: binaryAddressFromAddress(toAddress),
        created_at_time: None,
      },
    ],
  });
  if ("Err" in transferResult) {
    return Err({ PaymentFailed: `refund failed, err=${transferResult.Err}` });
  }
  return Ok({ PaymentCompleted: "refund completed" });
}

function generateCorrelationId(productId: text): nat64 {
  const correlationId = `${productId}_${ic.caller().toText()}_${ic.time()}`;
  return hash(correlationId);
}

/*
    after the order is created, we give the `delay` amount of minutes to pay for the order.
    if it's not paid during this timeframe, the order is automatically removed from the pending orders.
*/
// function discardByTimeout(memo: nat64, delay: Duration) {
//   ic.setTimer(delay, () => {
//     const order = pendingBookings.remove(memo);
//     console.log(`Order discarded ${order}`);
//   });
// }

async function verifyPaymentInternal(
  sender: Principal,
  amount: nat64,
  block: nat64,
  memo: nat64
): Promise<bool> {
  const blockData = await ic.call(icpCanister.query_blocks, {
    args: [{ start: block, length: 1n }],
  });
  const tx = blockData.blocks.find((block) => {
    if ("None" in block.transaction.operation) {
      return false;
    }
    const operation = block.transaction.operation.Some;
    const senderAddress = binaryAddressFromPrincipal(sender, 0);
    const receiverAddress = binaryAddressFromPrincipal(ic.id(), 0);
    return (
      block.transaction.memo === memo &&
      hash(senderAddress) === hash(operation.Transfer?.from) &&
      hash(receiverAddress) === hash(operation.Transfer?.to) &&
      amount === operation.Transfer?.amount.e8s
    );
  });
  return tx ? true : false;
}
