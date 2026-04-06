// DB clients
import prisma from './resources/prisma.js';
import redis from './resources/redis.js';

//Auth module
import AuthRepository from './modules/auth/auth.repository.js';
import AuthService from './modules/auth/auth.service.js';
import AuthController from './modules/auth/auth.controller.js';

// User module
import UserRepository from './modules/users/users.repository.js';
import UserService from './modules/users/users.service.js';
import UserController from './modules/users/users.controller.js';

// // Product module
// import ProductRepository from "./modules/product/product.repository.js"
// import ProductService from "./modules/product/product.service.js"
// import ProductController from "./modules/product/product.controller.js"

// // Order module
// import OrderRepository from "./modules/order/order.repository.js"
// import OrderService from "./modules/order/order.service.js"
// import OrderController from "./modules/order/order.controller.js"

// User
const usersRepository = new UserRepository(prisma, redis);
const usersService = new UserService(usersRepository);
const usersController = new UserController(usersService);

//Auth
const authRepository = new AuthRepository(prisma, redis);
const authService = new AuthService(authRepository, usersRepository);
const authController = new AuthController(authService);

// // Product
// const productRepository = new ProductRepository(db)
// const productService = new ProductService(productRepository)
// const productController = new ProductController(productService)

// // Order
// const orderRepository = new OrderRepository(db, redis)
// const orderService = new OrderService(orderRepository, productRepository)
// const orderController = new OrderController(orderService)

export const container = {
	prisma,
	redis,

	usersRepository,
	usersService,
	usersController,

	authRepository,
	authService,
	authController,

	//   productRepository,
	//   productService,
	//   productController,

	//   orderRepository,
	//   orderService,
	//   orderController,
};
