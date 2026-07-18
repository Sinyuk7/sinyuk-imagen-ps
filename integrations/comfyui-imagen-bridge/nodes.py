"""定义 Imagen workflow contract metadata nodes。"""


class ImagenWorkflowBindingContract:
    """保存 canonical binding contract，不参与 workflow 计算。"""

    CATEGORY = "Imagen PS/Contract"
    FUNCTION = "emit"
    OUTPUT_NODE = True
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        """声明唯一的 contract widget。"""

        return {
            "required": {
                "contract": (
                    "STRING",
                    {"default": "{}", "multiline": True},
                )
            }
        }

    def emit(self, contract):
        """保留 metadata node；真实验证由 canonical runtime validator 完成。"""

        del contract
        return ()


class ImagenWorkflowTypeContract:
    """保存 canonical type contract，不参与 workflow 计算。"""

    CATEGORY = "Imagen PS/Contract"
    FUNCTION = "emit"
    OUTPUT_NODE = True
    RETURN_TYPES = ()

    @classmethod
    def INPUT_TYPES(cls):
        """声明唯一的 contract widget。"""

        return {
            "required": {
                "contract": (
                    "STRING",
                    {"default": "{}", "multiline": True},
                )
            }
        }

    def emit(self, contract):
        """保留 metadata node；真实验证由 canonical runtime validator 完成。"""

        del contract
        return ()


NODE_CLASS_MAPPINGS = {
    "ImagenWorkflowBindingContract": ImagenWorkflowBindingContract,
    "ImagenWorkflowTypeContract": ImagenWorkflowTypeContract,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImagenWorkflowBindingContract": "Imagen Workflow Binding Contract",
    "ImagenWorkflowTypeContract": "Imagen Workflow Type Contract",
}
