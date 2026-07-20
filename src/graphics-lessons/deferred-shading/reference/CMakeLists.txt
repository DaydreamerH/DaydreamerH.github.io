if(NOT TARGET assimp::assimp)
    message(FATAL_ERROR "33_deferred_shading requires Assimp. Check the vendored Assimp dependency under include/assimp.")
endif()

add_executable(33_deferred_shading main.cpp ${GLAD_SOURCE})

if(WIN32)
    target_link_libraries(33_deferred_shading glfw opengl32 assimp::assimp)
else()
    target_link_libraries(33_deferred_shading glfw assimp::assimp)
endif()

copy_assimp_runtime(33_deferred_shading)

add_custom_command(TARGET 33_deferred_shading POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/buffer.vs"
    "$<TARGET_FILE_DIR:33_deferred_shading>/g_buffer.vs"
)

add_custom_command(TARGET 33_deferred_shading POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
    "${CMAKE_CURRENT_SOURCE_DIR}/buffer.fs"
    "$<TARGET_FILE_DIR:33_deferred_shading>/g_buffer.fs"
)

foreach(FILE_NAME deferred_shading.vs deferred_shading.fs light_box.vs light_box.fs)
    add_custom_command(TARGET 33_deferred_shading POST_BUILD
        COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${CMAKE_CURRENT_SOURCE_DIR}/${FILE_NAME}"
        "$<TARGET_FILE_DIR:33_deferred_shading>/${FILE_NAME}"
    )
endforeach()

add_custom_command(TARGET 33_deferred_shading POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_directory
    "${CMAKE_SOURCE_DIR}/model/backpack"
    "$<TARGET_FILE_DIR:33_deferred_shading>/model/backpack"
)
