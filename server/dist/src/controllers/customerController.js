import { prisma } from "../config/prisma.js";
const normalizeSlug = (text) => text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
const ensureUserId = (req, res) => {
    const userId = req.user?.id;
    if (!userId) {
        res.status(401).json({ message: "Authentication required" });
        return null;
    }
    return userId;
};
const normalizeParam = (value) => typeof value === "string" ? value : Array.isArray(value) ? value[0] : undefined;
const getCustomer = async (userId) => {
    const customer = await prisma.customer.findUnique({
        where: { userId },
        include: { cart: { include: { items: { include: { product: true } } } } },
    });
    if (!customer) {
        throw new Error("Customer profile not found");
    }
    return customer;
};
const getOrCreateCart = async (customerId) => {
    const existingCart = await prisma.cart.findUnique({ where: { customerId } });
    if (existingCart) {
        return existingCart;
    }
    return prisma.cart.create({ data: { customerId } });
};
export const getCustomerProfile = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                fullName: true,
                email: true,
                role: true,
                seller: false,
                customer: {
                    select: {
                        phone: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
            },
        });
        if (!user) {
            res.status(404).json({ message: "Customer not found" });
            return;
        }
        res.json(user);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to load customer profile" });
    }
};
export const updateCustomerProfile = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const { fullName, phone } = req.body;
        const updates = {};
        if (fullName)
            updates.fullName = fullName.trim();
        if (phone)
            updates.phone = phone.trim();
        if (!Object.keys(updates).length) {
            res.status(400).json({ message: "No profile fields provided" });
            return;
        }
        const user = await prisma.user.update({
            where: { id: userId },
            data: updates,
            select: { id: true, fullName: true, email: true, role: true },
        });
        if (phone) {
            await prisma.customer.updateMany({ where: { userId }, data: { phone: phone.trim() } });
        }
        res.json(user);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to update customer profile" });
    }
};
export const getCustomerAddresses = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const addresses = await prisma.address.findMany({ where: { customerId: customer.id }, orderBy: { createdAt: "desc" } });
        res.json(addresses);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to load addresses" });
    }
};
export const createCustomerAddress = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const { street, city, province, country, postalCode, isDefault } = req.body;
        if (!street || !city || !province || !country || !postalCode) {
            res.status(400).json({ message: "street, city, province, country, and postalCode are required" });
            return;
        }
        if (isDefault) {
            await prisma.address.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
        }
        const address = await prisma.address.create({
            data: {
                customerId: customer.id,
                street: street.trim(),
                city: city.trim(),
                province: province.trim(),
                country: country.trim(),
                postalCode: postalCode.trim(),
                isDefault: Boolean(isDefault),
            },
        });
        res.status(201).json(address);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to create address" });
    }
};
export const updateCustomerAddress = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const addressId = normalizeParam(req.params.id);
        if (!addressId) {
            res.status(400).json({ message: "Address id is required" });
            return;
        }
        const existing = await prisma.address.findFirst({ where: { id: addressId, customerId: customer.id } });
        if (!existing) {
            res.status(404).json({ message: "Address not found" });
            return;
        }
        const { street, city, province, country, postalCode, isDefault } = req.body;
        if (isDefault) {
            await prisma.address.updateMany({ where: { customerId: customer.id }, data: { isDefault: false } });
        }
        const address = await prisma.address.update({
            where: { id: addressId },
            data: {
                street: street?.trim() ?? existing.street,
                city: city?.trim() ?? existing.city,
                province: province?.trim() ?? existing.province,
                country: country?.trim() ?? existing.country,
                postalCode: postalCode?.trim() ?? existing.postalCode,
                isDefault: typeof isDefault === "boolean" ? isDefault : existing.isDefault,
            },
        });
        res.json(address);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to update address" });
    }
};
export const deleteCustomerAddress = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const addressId = normalizeParam(req.params.id);
        if (!addressId) {
            res.status(400).json({ message: "Address id is required" });
            return;
        }
        const existing = await prisma.address.findFirst({ where: { id: addressId, customerId: customer.id } });
        if (!existing) {
            res.status(404).json({ message: "Address not found" });
            return;
        }
        await prisma.address.delete({ where: { id: addressId } });
        res.json({ message: "Address deleted successfully" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to delete address" });
    }
};
export const searchProducts = async (req, res) => {
    try {
        const { q, category, shop } = req.query;
        const where = {
            isAvailable: true,
            stock: { gt: 0 },
        };
        if (q) {
            Object.assign(where, {
                OR: [
                    { name: { contains: q, mode: "insensitive" } },
                    { description: { contains: q, mode: "insensitive" } },
                ],
            });
        }
        if (category) {
            Object.assign(where, { category: { slug: category } });
        }
        if (shop) {
            Object.assign(where, { seller: { storeName: { contains: shop, mode: "insensitive" } } });
        }
        const products = await prisma.product.findMany({
            where,
            include: { category: true, seller: { select: { id: true, storeName: true, phone: true } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(products);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to search products" });
    }
};
export const searchShops = async (req, res) => {
    try {
        const { q } = req.query;
        const where = q
            ? { storeName: { contains: q, mode: "insensitive" } }
            : {};
        const sellers = await prisma.seller.findMany({
            where,
            include: {
                user: { select: { id: true, fullName: true, email: true } },
                products: { select: { id: true, name: true, price: true, imageUrl: true, isAvailable: true } },
            },
            orderBy: { createdAt: "desc" },
        });
        res.json(sellers);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to search shops" });
    }
};
export const getProductDetails = async (req, res) => {
    try {
        const productId = normalizeParam(req.params.id);
        if (!productId) {
            res.status(400).json({ message: "Product id is required" });
            return;
        }
        const product = await prisma.product.findUnique({
            where: { id: productId },
            include: {
                category: true,
                seller: { select: { id: true, storeName: true, phone: true } },
            },
        });
        if (!product) {
            res.status(404).json({ message: "Product not found" });
            return;
        }
        res.json(product);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to load product details" });
    }
};
export const getFavorites = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const favorites = await prisma.favorite.findMany({
            where: { customerId: customer.id },
            include: { product: { include: { category: true, seller: { select: { id: true, storeName: true } } } } },
            orderBy: { createdAt: "desc" },
        });
        res.json(favorites);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to load favorites" });
    }
};
export const addFavorite = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const { productId } = req.body;
        if (!productId) {
            res.status(400).json({ message: "productId is required" });
            return;
        }
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
            res.status(404).json({ message: "Product not found" });
            return;
        }
        const existingFavorite = await prisma.favorite.findUnique({
            where: { customerId_productId: { customerId: customer.id, productId } },
        });
        if (existingFavorite) {
            res.status(200).json(existingFavorite);
            return;
        }
        const favorite = await prisma.favorite.create({
            data: { customerId: customer.id, productId },
        });
        res.status(201).json(favorite);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to add favorite" });
    }
};
export const removeFavorite = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const productId = normalizeParam(req.params.productId);
        if (!productId) {
            res.status(400).json({ message: "Product id is required" });
            return;
        }
        const existingFavorite = await prisma.favorite.findUnique({
            where: { customerId_productId: { customerId: customer.id, productId } },
        });
        if (!existingFavorite) {
            res.status(404).json({ message: "Favorite not found" });
            return;
        }
        await prisma.favorite.delete({ where: { id: existingFavorite.id } });
        res.json({ message: "Favorite removed" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to remove favorite" });
    }
};
export const getCart = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const cart = await prisma.cart.findUnique({
            where: { customerId: customer.id },
            include: { items: { include: { product: true } } },
        });
        const items = cart?.items ?? [];
        const activeItems = items.filter((item) => !item.savedForLater);
        const savedForLaterItems = items.filter((item) => item.savedForLater);
        const subtotal = activeItems.reduce((sum, item) => sum + item.quantity * item.product.price, 0);
        const deliveryFee = subtotal === 0 ? 0 : subtotal >= 100 ? 0 : 10;
        const total = subtotal + deliveryFee;
        res.json({
            activeItems,
            savedForLaterItems,
            subtotal,
            deliveryFee,
            total,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to load cart" });
    }
};
export const addToCart = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const cart = await getOrCreateCart(customer.id);
        const { productId, quantity } = req.body;
        if (!productId || typeof quantity === "undefined") {
            res.status(400).json({ message: "productId and quantity are required" });
            return;
        }
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product || !product.isAvailable || product.stock <= 0) {
            res.status(404).json({ message: "Product unavailable" });
            return;
        }
        const existingItem = await prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId } },
        });
        const cartItem = existingItem
            ? await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { quantity: existingItem.quantity + Number(quantity), savedForLater: false },
            })
            : await prisma.cartItem.create({
                data: { cartId: cart.id, productId, quantity: Number(quantity), savedForLater: false },
            });
        res.status(201).json(cartItem);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to add to cart" });
    }
};
export const updateCartItem = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const cart = await getOrCreateCart(customer.id);
        const productId = normalizeParam(req.params.productId);
        const { quantity, savedForLater } = req.body;
        if (!productId) {
            res.status(400).json({ message: "productId is required" });
            return;
        }
        const existingItem = await prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId } },
        });
        if (!existingItem) {
            res.status(404).json({ message: "Cart item not found" });
            return;
        }
        if (typeof savedForLater === "boolean") {
            const item = await prisma.cartItem.update({
                where: { id: existingItem.id },
                data: { savedForLater },
            });
            res.json(item);
            return;
        }
        if (typeof quantity === "undefined") {
            res.status(400).json({ message: "quantity is required" });
            return;
        }
        if (quantity <= 0) {
            await prisma.cartItem.delete({ where: { id: existingItem.id } });
            res.json({ message: "Cart item removed" });
            return;
        }
        const item = await prisma.cartItem.update({
            where: { id: existingItem.id },
            data: { quantity: Number(quantity) },
        });
        res.json(item);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to update cart item" });
    }
};
export const removeCartItem = async (req, res) => {
    try {
        const userId = ensureUserId(req, res);
        if (!userId)
            return;
        const customer = await getCustomer(userId);
        const cart = await getOrCreateCart(customer.id);
        const productId = normalizeParam(req.params.productId);
        if (!productId) {
            res.status(400).json({ message: "Product id is required" });
            return;
        }
        const existingItem = await prisma.cartItem.findUnique({
            where: { cartId_productId: { cartId: cart.id, productId } },
        });
        if (!existingItem) {
            res.status(404).json({ message: "Cart item not found" });
            return;
        }
        await prisma.cartItem.delete({ where: { id: existingItem.id } });
        res.json({ message: "Cart item removed" });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: "Unable to remove cart item" });
    }
};
//# sourceMappingURL=customerController.js.map